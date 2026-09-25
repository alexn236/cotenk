//! CoTenk desktop backend.
//!
//! Owns the local `devin acp` subprocess (newline-delimited JSON-RPC over
//! stdio) and exposes it to the webview via commands + events:
//!
//!   commands: acp_spawn / acp_write / acp_kill / devin_api_key /
//!             devin_status / devin_login / workspace_dir /
//!             fs_read / fs_write / fs_remove / fs_list_md /
//!             fs_watch / fs_unwatch / open_folder
//!   events:   "acp:line" (stdout line), "acp:exit" (process ended),
//!             "ws:fs" (paths changed inside the watched workspace)
//!
//! All ACP/JSON-RPC logic stays in the frontend; this side is a dumb,
//! reliable pipe plus local file/credential helpers.

use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Mutex;

use notify::{RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

struct AcpProcess {
    child: Child,
    stdin: ChildStdin,
}

struct WatchState(Mutex<Option<notify::RecommendedWatcher>>);

#[derive(Default)]
struct AcpState(Mutex<Option<AcpProcess>>);

fn home_dir() -> String {
    std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".to_string())
}

fn devin_bin() -> String {
    std::env::var("DEVIN_CLI").unwrap_or_else(|_| "devin".to_string())
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
fn acp_spawn(app: AppHandle, state: State<AcpState>, dir: Option<String>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|_| "state poisoned")?;

    // Reap a dead child before deciding we're already running.
    if let Some(p) = guard.as_mut() {
        match p.child.try_wait() {
            Ok(None) => return Ok(()),      // still running
            Ok(Some(_)) | Err(_) => {
                let _ = guard.take();
            }
        }
    }

    let bin = devin_bin();
    let dir = dir.unwrap_or_else(workspace_dir);
    std::fs::create_dir_all(&dir).map_err(|e| format!("cannot create workspace dir: {e}"))?;
    let try_spawn = |b: &str| {
        Command::new(b)
            .arg("acp")
            .current_dir(&dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
    };
    let mut child = try_spawn(&bin)
        .or_else(|_| try_spawn(&format!("{bin}.exe")))
        .map_err(|e| format!("failed to spawn `{bin} acp`: {e}"))?;

    let stdin = child.stdin.take().ok_or("devin acp: no stdin")?;
    let stdout = child.stdout.take().ok_or("devin acp: no stdout")?;

    let app2 = app.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(l) if !l.trim().is_empty() => {
                    let _ = app2.emit("acp:line", l);
                }
                Ok(_) => {}
                Err(_) => break,
            }
        }
        let _ = app2.emit("acp:exit", ());
    });

    *guard = Some(AcpProcess { child, stdin });
    Ok(())
}

#[tauri::command]
fn acp_write(state: State<AcpState>, line: String) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|_| "state poisoned")?;
    let p = guard.as_mut().ok_or("agent process not running")?;
    p.stdin
        .write_all(line.as_bytes())
        .and_then(|_| p.stdin.write_all(b"\n"))
        .and_then(|_| p.stdin.flush())
        .map_err(|e| format!("write to devin acp: {e}"))
}

#[tauri::command]
fn acp_kill(state: State<AcpState>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|_| "state poisoned")?;
    if let Some(mut p) = guard.take() {
        let _ = p.child.kill();
        let _ = p.child.wait(); // reap
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

#[tauri::command]
fn devin_status() -> DevinStatus {
    let bin = devin_bin();
    let version = Command::new(&bin)
        .arg("--version")
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|s| !s.is_empty());
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
                stack.push(p);
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
