//! CoTenk desktop backend.
//!
//! Owns the local ACP agent subprocesses (newline-delimited JSON-RPC over
//! stdio) — one per agent kind (`devin acp`, the Claude Code ACP adapter)
//! — and exposes them to the webview via commands + events:
//!
//!   commands: acp_spawn / acp_write / acp_kill / devin_api_key /
//!             devin_status / devin_login / claude_status / claude_login /
//!             workspace_dir / fs_read / fs_write / fs_remove /
//!             fs_list_md / fs_watch / fs_unwatch / open_folder
//!   events:   "acp:line" ({agent, line} per stdout line),
//!             "acp:exit" (id of the agent whose process ended),
//!             "ws:fs" (paths changed inside the watched workspace)
//!
//! All ACP/JSON-RPC logic stays in the frontend; this side is a dumb,
//! reliable pipe plus local file/credential helpers.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use notify::{RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

struct AcpProcess {
    child: Child,
    stdin: ChildStdin,
    /// Distinguishes a respawned process from the one it replaced, so a
    /// late exit of the old one doesn't tear down the new session.
    generation: u64,
}

struct WatchState(Mutex<Option<notify::RecommendedWatcher>>);

/// agent id ("devin" | "claude") → its running process
#[derive(Default)]
struct AcpState(Mutex<HashMap<String, AcpProcess>>);

static GENERATION: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, Serialize)]
struct AcpLine {
    agent: String,
    line: String,
}

fn home_dir() -> String {
    std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".to_string())
}

fn devin_bin() -> String {
    std::env::var("DEVIN_CLI").unwrap_or_else(|_| "devin".to_string())
}

/// npm package of the Claude Code ACP adapter (formerly
/// `@zed-industries/claude-code-acp`).
const CLAUDE_ACP_PACKAGE: &str = "@agentclientprotocol/claude-agent-acp";

/// `Command::new` doesn't consult PATHEXT on Windows, so npm's `.cmd`
/// shims (claude, npx, claude-agent-acp) have to be named explicitly.
fn bin_candidates(name: &str) -> Vec<String> {
    if cfg!(windows) {
        vec![
            format!("{name}.cmd"),
            format!("{name}.exe"),
            name.to_string(),
        ]
    } else {
        vec![name.to_string()]
    }
}

/// A command that never flashes a console window on Windows.
fn quiet_command(bin: &str) -> Command {
    #[allow(unused_mut)]
    let mut cmd = Command::new(bin);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// Stdout of the first candidate that runs successfully.
fn run_first(bins: &[String], args: &[&str]) -> Option<String> {
    bins.iter().find_map(|b| {
        quiet_command(b)
            .args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .output()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
    })
}

/// Launch candidates (binary, args) per agent, tried in order.
fn agent_launchers(agent: &str) -> Result<Vec<(String, Vec<String>)>, String> {
    match agent {
        "devin" => {
            let bin = devin_bin();
            Ok(vec![
                (bin.clone(), vec!["acp".into()]),
                (format!("{bin}.exe"), vec!["acp".into()]),
            ])
        }
        "claude" => {
            let mut out = Vec::new();
            if let Ok(bin) = std::env::var("CLAUDE_ACP_BIN") {
                out.push((bin, vec![]));
            }
            // A globally installed adapter starts fastest; npx fetches it
            // on first use.
            for b in bin_candidates("claude-agent-acp") {
                out.push((b, vec![]));
            }
            for b in bin_candidates("npx") {
                out.push((b, vec!["-y".into(), CLAUDE_ACP_PACKAGE.into()]));
            }
            Ok(out)
        }
        other => Err(format!("unknown agent `{other}`")),
    }
}

fn agent_label(agent: &str) -> &'static str {
    match agent {
        "claude" => "Claude Code",
        _ => "Devin CLI",
    }
}

/// Default workspace folder: ~/Documents/CoTenk (created on demand).
#[tauri::command]
fn workspace_dir() -> String {
    let docs = Path::new(&home_dir()).join("Documents");
    let base = if docs.is_dir() {
        docs
    } else {
        PathBuf::from(home_dir())
    };
    base.join("CoTenk").to_string_lossy().to_string()
}

#[tauri::command]
fn acp_spawn(
    app: AppHandle,
    state: State<AcpState>,
    agent: String,
    dir: Option<String>,
) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|_| "state poisoned")?;

    // Reap a dead child before deciding we're already running.
    if let Some(p) = guard.get_mut(&agent) {
        match p.child.try_wait() {
            Ok(None) => return Ok(()), // still running
            Ok(Some(_)) | Err(_) => {
                guard.remove(&agent);
            }
        }
    }

    let launchers = agent_launchers(&agent)?;
    let dir = dir.unwrap_or_else(workspace_dir);
    std::fs::create_dir_all(&dir).map_err(|e| format!("cannot create workspace dir: {e}"))?;

    let mut last_err = String::new();
    let mut spawned = None;
    for (bin, args) in &launchers {
        match quiet_command(bin)
            .args(args)
            .current_dir(&dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
        {
            Ok(child) => {
                spawned = Some(child);
                break;
            }
            Err(e) => last_err = format!("{bin}: {e}"),
        }
    }
    let mut child = spawned
        .ok_or_else(|| format!("{} not found ({last_err})", agent_label(&agent)))?;

    let stdin = child.stdin.take().ok_or("agent: no stdin")?;
    let stdout = child.stdout.take().ok_or("agent: no stdout")?;
    let generation = GENERATION.fetch_add(1, Ordering::Relaxed);

    let app2 = app.clone();
    let agent2 = agent.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(l) if !l.trim().is_empty() => {
                    let _ = app2.emit(
                        "acp:line",
                        AcpLine {
                            agent: agent2.clone(),
                            line: l,
                        },
                    );
                }
                Ok(_) => {}
                Err(_) => break,
            }
        }
        // Only report the exit if this process hasn't been replaced.
        let current = app2
            .state::<AcpState>()
            .0
            .lock()
            .ok()
            .and_then(|g| g.get(&agent2).map(|p| p.generation));
        if current.is_none() || current == Some(generation) {
            let _ = app2.emit("acp:exit", agent2);
        }
    });

    guard.insert(
        agent,
        AcpProcess {
            child,
            stdin,
            generation,
        },
    );
    Ok(())
}

#[tauri::command]
fn acp_write(state: State<AcpState>, agent: String, line: String) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|_| "state poisoned")?;
    let p = guard
        .get_mut(&agent)
        .ok_or_else(|| format!("{} is not running", agent_label(&agent)))?;
    p.stdin
        .write_all(line.as_bytes())
        .and_then(|_| p.stdin.write_all(b"\n"))
        .and_then(|_| p.stdin.flush())
        .map_err(|e| format!("write to {}: {e}", agent_label(&agent)))
}

/// Stops one agent, or every agent when `agent` is omitted.
#[tauri::command]
fn acp_kill(state: State<AcpState>, agent: Option<String>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|_| "state poisoned")?;
    let victims: Vec<AcpProcess> = match agent {
        Some(a) => guard.remove(&a).into_iter().collect(),
        None => guard.drain().map(|(_, p)| p).collect(),
    };
    drop(guard);
    for p in victims {
        let AcpProcess {
            mut child, stdin, ..
        } = p;
        // Closing stdin ends the ACP connection, so an adapter started
        // through a shim (npx → node) exits even though only the shim
        // process is killed here.
        drop(stdin);
        let _ = child.kill();
        let _ = child.wait(); // reap
    }
    Ok(())
}

/// Reads the local Devin CLI credential file and returns the stored
/// API key, so the frontend can call `authenticate` over ACP.
/// The value never touches disk again — it is only used in-memory.
#[tauri::command]
fn devin_api_key() -> Option<String> {
    credential_paths()
        .iter()
        .filter_map(|p| std::fs::read_to_string(p).ok())
        .find_map(|content| extract_api_key(&content))
}

fn credential_paths() -> Vec<String> {
    let mut paths: Vec<String> = Vec::new();
    if let Ok(appdata) = std::env::var("APPDATA") {
        paths.push(format!(r"{appdata}\devin\credentials.toml"));
    }
    let home = home_dir();
    paths.push(format!("{home}/.config/devin/credentials.toml"));
    paths.push(format!(r"{home}/AppData/Roaming/devin/credentials.toml"));
    paths
}

fn extract_api_key(content: &str) -> Option<String> {
    for line in content.lines() {
        let l = line.trim();
        let Some(rest) = l.strip_prefix("windsurf_api_key") else {
            continue;
        };
        let v = rest
            .trim_start_matches(|c| c == '=' || c == ' ' || c == '\t')
            .trim()
            .trim_matches('"');
        if !v.is_empty() {
            return Some(v.to_string());
        }
    }
    None
}

#[derive(Serialize)]
struct DevinStatus {
    /// `devin` binary found on PATH (or via DEVIN_CLI).
    binary: bool,
    /// `devin --version` output, if the binary runs.
    version: Option<String>,
    /// A credentials.toml with an api key exists.
    authed: bool,
}

/// Async so the `--version` probe runs off the main (UI) thread.
#[tauri::command]
async fn devin_status() -> DevinStatus {
    let version = run_first(&[devin_bin()], &["--version"]).filter(|s| !s.is_empty());
    let authed = credential_paths()
        .iter()
        .filter_map(|p| std::fs::read_to_string(p).ok())
        .any(|c| extract_api_key(&c).is_some());
    DevinStatus {
        binary: version.is_some(),
        version,
        authed,
    }
}

/// Starts `devin auth login` detached — the CLI drives its own
/// browser-based sign-in flow.
#[tauri::command]
fn devin_login() -> Result<(), String> {
    Command::new(devin_bin())
        .args(["auth", "login"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("failed to run `devin auth login`: {e}"))
}

#[derive(Serialize)]
struct ClaudeStatus {
    /// `claude --version` output — the Claude Code CLI is installed.
    cli: Option<String>,
    /// `claude auth status` reports a signed-in account.
    authed: bool,
    /// The ACP adapter is installed globally (else npx fetches it).
    adapter: bool,
    /// npx is available as the adapter fallback.
    npx: bool,
}

#[tauri::command]
async fn claude_status() -> ClaudeStatus {
    let claude = bin_candidates("claude");
    let cli = run_first(&claude, &["--version"]).filter(|s| !s.is_empty());
    let from_env = std::env::var("ANTHROPIC_API_KEY").is_ok_and(|k| !k.trim().is_empty());
    let authed = from_env
        || (cli.is_some()
            && run_first(&claude, &["auth", "status"])
                .and_then(|out| serde_json::from_str::<serde_json::Value>(&out).ok())
                .and_then(|v| v.get("loggedIn").and_then(|b| b.as_bool()))
                .unwrap_or(false));
    let adapter = std::env::var("CLAUDE_ACP_BIN").is_ok()
        || run_first(&bin_candidates("claude-agent-acp"), &["--version"]).is_some();
    let npx = adapter || run_first(&bin_candidates("npx"), &["--version"]).is_some();
    ClaudeStatus {
        cli,
        authed,
        adapter,
        npx,
    }
}

/// Opens a terminal running `claude auth login` — the CLI's sign-in is
/// interactive (browser + optional code paste), so it needs a console.
#[tauri::command]
fn claude_login() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = Command::new("cmd");
        c.args(["/C", "start", "Claude Code login", "cmd", "/K", "claude auth login"]);
        c
    };
    #[cfg(target_os = "macos")]
    let mut cmd = {
        let mut c = Command::new("osascript");
        c.args([
            "-e",
            "tell application \"Terminal\" to do script \"claude auth login\"",
            "-e",
            "tell application \"Terminal\" to activate",
        ]);
        c
    };
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut cmd = {
        let mut c = Command::new("x-terminal-emulator");
        c.args(["-e", "claude auth login"]);
        c
    };
    cmd.stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("could not open a terminal for `claude auth login`: {e}"))
}

// ---------- workspace filesystem ----------

#[tauri::command]
fn fs_read(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("read {path}: {e}"))
}

#[tauri::command]
fn fs_write(path: String, contents: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir {parent:?}: {e}"))?;
    }
    std::fs::write(&path, contents).map_err(|e| format!("write {path}: {e}"))
}

#[tauri::command]
fn fs_remove(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Ok(());
    }
    if p.is_dir() {
        std::fs::remove_dir_all(p).map_err(|e| format!("rmdir {path}: {e}"))
    } else {
        std::fs::remove_file(p).map_err(|e| format!("remove {path}: {e}"))
    }
}

#[derive(Serialize)]
struct FileEntry {
    path: String,
    /// Last-modified in milliseconds since UNIX epoch (0 if unknown).
    mtime: u64,
}

/// All `.md` files under `root`, recursively, with modification times.
#[tauri::command]
fn fs_list_md(root: String) -> Result<Vec<FileEntry>, String> {
    let mut out = Vec::new();
    let mut stack = vec![PathBuf::from(&root)];
    while let Some(dir) = stack.pop() {
        let entries = match std::fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue, // missing/unreadable dir contributes nothing
        };
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                // Dot folders hold agent config (.claude/skills, .git) —
                // their markdown is not workspace pages.
                let hidden = p
                    .file_name()
                    .is_some_and(|n| n.to_string_lossy().starts_with('.'));
                if !hidden {
                    stack.push(p);
                }
                continue;
            }
            if !p.extension().is_some_and(|e| e == "md") {
                continue;
            }
            let mtime = entry
                .metadata()
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            out.push(FileEntry {
                path: p.to_string_lossy().to_string(),
                mtime,
            });
        }
    }
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

/// Watch `root` recursively; every fs change emits "ws:fs" with the
/// affected paths (strings). Replaces any previous watcher.
#[tauri::command]
fn fs_watch(app: AppHandle, state: State<WatchState>, root: String) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|_| "state poisoned")?;
    *guard = None; // dropping the old watcher stops it

    std::fs::create_dir_all(&root).map_err(|e| format!("workspace dir: {e}"))?;
    let app2 = app.clone();
    let mut watcher = notify::recommended_watcher(
        move |res: Result<notify::Event, notify::Error>| {
            if let Ok(event) = res {
                let paths: Vec<String> = event
                    .paths
                    .iter()
                    .map(|p| p.to_string_lossy().to_string())
                    .collect();
                if !paths.is_empty() {
                    let _ = app2.emit("ws:fs", paths);
                }
            }
        },
    )
    .map_err(|e| format!("watcher init: {e}"))?;
    watcher
        .watch(Path::new(&root), RecursiveMode::Recursive)
        .map_err(|e| format!("watch {root}: {e}"))?;
    *guard = Some(watcher);
    Ok(())
}

#[tauri::command]
fn fs_unwatch(state: State<WatchState>) {
    if let Ok(mut guard) = state.0.lock() {
        *guard = None;
    }
}

/// Reveal a folder in the OS file manager.
#[tauri::command]
fn open_folder(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|e| format!("mkdir: {e}"))?;
    #[cfg(target_os = "windows")]
    let cmd = ("explorer", vec![path.clone()]);
    #[cfg(target_os = "macos")]
    let cmd = ("open", vec![path.clone()]);
    #[cfg(all(unix, not(target_os = "macos")))]
    let cmd = ("xdg-open", vec![path.clone()]);
    Command::new(cmd.0)
        .args(&cmd.1)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("open folder: {e}"))
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AcpState::default())
        .manage(WatchState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            acp_spawn,
            acp_write,
            acp_kill,
            devin_api_key,
            devin_status,
            devin_login,
            claude_status,
            claude_login,
            workspace_dir,
            fs_read,
            fs_write,
            fs_remove,
            fs_list_md,
            fs_watch,
            fs_unwatch,
            open_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running cotenk");
}
