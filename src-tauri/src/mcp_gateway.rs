//! The CoTenk MCP gateway for Devin CLI.
//!
//! Devin ignores MCP servers passed in ACP `session/new`, so CoTenk lists one
//! server — `cotenk --mcp-gateway <config.json>` — in the workspace's
//! `.devin/mcp_config.local.json`. The gateway only works for Devin
//! processes CoTenk started: those carry `COTENK_GATEWAY_TOKEN`, which must
//! match the token in the config file. A plain `devin` run in the workspace
//! sees a server without tools.
//!
//! When authorized it offers:
//!  - `load_skill` — the enabled skills (`<skillsDir>/<name>/SKILL.md`);
//!    its description doubles as the skill index.
//!  - every tool of the user's MCP servers as `<server>__<tool>`. Servers
//!    are stdio commands (URL servers arrive wrapped in mcp-remote), started
//!    on first use and restarted when their config changes.
//!
//! The config is re-read on every request, so edits in Settings → Skills &
//! MCP apply without restarting Devin. Speaks newline-delimited JSON-RPC 2.0
//! over stdio (MCP stdio transport).

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::process::{Child, ChildStdin, Stdio};
use std::sync::mpsc::{channel, Receiver, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::Deserialize;
use serde_json::{json, Value};

pub const FLAG: &str = "--mcp-gateway";
const TOKEN_ENV: &str = "COTENK_GATEWAY_TOKEN";
const SKILL_TOOL: &str = "load_skill";
const SEP: &str = "__";
const PROTOCOL: &str = "2025-06-18";

#[derive(Deserialize, Clone, PartialEq)]
struct ServerSpec {
    name: String,
    command: String,
    #[serde(default)]
    args: Vec<String>,
    #[serde(default)]
    env: HashMap<String, String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Config {
    token: String,
    skills_dir: String,
    #[serde(default)]
    servers: Vec<ServerSpec>,
}

fn load_config(path: &Path) -> Option<Config> {
    serde_json::from_str(&std::fs::read_to_string(path).ok()?).ok()
}

/// Started by CoTenk (token in env) and the config still belongs to it.
fn authorized(cfg: &Config) -> bool {
    !cfg.token.is_empty() && std::env::var(TOKEN_ENV).is_ok_and(|t| t == cfg.token)
}

/* ---------- skills ---------- */

struct Skill {
    name: String,
    description: String,
    content: String,
}

/// `name:` / `description:` from a SKILL.md frontmatter block.
fn frontmatter_field(content: &str, key: &str) -> Option<String> {
    let mut lines = content.lines();
    if lines.next()?.trim() != "---" {
        return None;
    }
    for line in lines {
        let l = line.trim();
        if l == "---" {
            break;
        }
        if let Some(v) = l.strip_prefix(key).and_then(|r| r.strip_prefix(':')) {
            let v = v.trim();
            // CoTenk writes JSON-quoted scalars; others may use plain YAML.
            if let Ok(s) = serde_json::from_str::<String>(v) {
                return Some(s);
            }
            return Some(v.trim_matches('"').trim_matches('\'').to_string());
        }
    }
    None
}

fn read_skills(dir: &Path) -> Vec<Skill> {
    let mut out: Vec<Skill> = std::fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|entry| {
            let content = std::fs::read_to_string(entry.path().join("SKILL.md")).ok()?;
            let folder = entry.file_name().to_string_lossy().to_string();
            Some(Skill {
                name: frontmatter_field(&content, "name").unwrap_or(folder),
                description: frontmatter_field(&content, "description").unwrap_or_default(),
                content,
            })
        })
        .collect();
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

fn skill_tool(dir: &Path) -> Value {
    let skills = read_skills(dir);
    let index = if skills.is_empty() {
        "No skills are installed right now.".to_string()
    } else {
        skills
            .iter()
            .map(|s| format!("- {}: {}", s.name, s.description))
            .collect::<Vec<_>>()
            .join("\n")
    };
    json!({
        "name": SKILL_TOOL,
        "description": format!(
            "Load a CoTenk skill — step-by-step instructions for a specific kind of task. \
             Before starting a task one of these skills covers, call this tool with its \
             name and follow the returned instructions.\n\nAvailable skills:\n{index}"
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "name": { "type": "string", "description": "Skill name from the list" }
            },
            "required": ["name"]
        }
    })
}

fn tool_result(text: String, is_error: bool) -> Value {
    json!({ "content": [{ "type": "text", "text": text }], "isError": is_error })
}

fn load_skill(dir: &Path, args: &Value) -> Value {
    let wanted = args.get("name").and_then(Value::as_str).unwrap_or_default().trim();
    let skills = read_skills(dir);
    match skills.iter().find(|s| s.name.eq_ignore_ascii_case(wanted)) {
        Some(s) => tool_result(s.content.clone(), false),
        None => tool_result(
            format!(
                "No skill named `{wanted}`. Available: {}",
                skills.iter().map(|s| s.name.as_str()).collect::<Vec<_>>().join(", ")
            ),
            true,
        ),
    }
}

/* ---------- upstream MCP servers ---------- */

struct Upstream {
    spec: ServerSpec,
    child: Child,
    stdin: Arc<Mutex<ChildStdin>>,
    rx: Receiver<Value>,
    next_id: u64,
}

fn write_line(stdin: &Mutex<ChildStdin>, msg: &Value) -> Result<(), String> {
    let mut s = stdin.lock().map_err(|_| "stdin poisoned")?;
    writeln!(s, "{msg}")
        .and_then(|_| s.flush())
        .map_err(|e| format!("write: {e}"))
}

impl Upstream {
    fn start(spec: &ServerSpec) -> Result<Self, String> {
        let mut child = crate::quiet_command(&spec.command)
            .args(&spec.args)
            .envs(&spec.env)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("could not start `{}`: {e}", spec.command))?;
        let stdin = Arc::new(Mutex::new(child.stdin.take().ok_or("no stdin")?));
        let stdout = child.stdout.take().ok_or("no stdout")?;
        let (tx, rx) = channel();
        let answer = stdin.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                let Ok(line) = line else { break };
                let Ok(msg) = serde_json::from_str::<Value>(&line) else {
                    continue;
                };
                match (msg.get("method"), msg.get("id")) {
                    // Server → client requests (ping, roots/list, sampling…).
                    (Some(m), Some(id)) => {
                        let reply = if m == "ping" {
                            json!({ "jsonrpc": "2.0", "id": id, "result": {} })
                        } else if m == "roots/list" {
                            json!({ "jsonrpc": "2.0", "id": id, "result": { "roots": [] } })
                        } else {
                            json!({ "jsonrpc": "2.0", "id": id, "error": {
                                "code": -32601, "message": "not supported by the CoTenk gateway"
                            }})
                        };
                        let _ = write_line(&answer, &reply);
                    }
                    (Some(_), None) => {} // notifications
                    _ => {
                        if tx.send(msg).is_err() {
                            break;
                        }
                    }
                }
            }
        });
        let mut up = Upstream {
            spec: spec.clone(),
            child,
            stdin,
            rx,
            next_id: 1,
        };
        // npx may download the package first — give it time.
        up.request(
            "initialize",
            json!({
                "protocolVersion": PROTOCOL,
                "capabilities": {},
                "clientInfo": { "name": "cotenk-gateway", "version": env!("CARGO_PKG_VERSION") }
            }),
            Duration::from_secs(90),
        )?;
        write_line(
            &up.stdin,
            &json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }),
        )?;
        Ok(up)
    }

    fn alive(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }

    fn request(&mut self, method: &str, params: Value, timeout: Duration) -> Result<Value, String> {
        let id = self.next_id;
        self.next_id += 1;
        write_line(
            &self.stdin,
            &json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params }),
        )?;
        let deadline = Instant::now() + timeout;
        loop {
            let left = deadline.saturating_duration_since(Instant::now());
            match self.rx.recv_timeout(left) {
                Ok(msg) if msg.get("id") == Some(&json!(id)) => {
                    if let Some(err) = msg.get("error") {
                        return Err(err
                            .get("message")
                            .and_then(Value::as_str)
                            .unwrap_or("error")
                            .to_string());
                    }
                    return Ok(msg.get("result").cloned().unwrap_or(Value::Null));
                }
                Ok(_) => continue, // a late answer to an earlier request
                Err(RecvTimeoutError::Timeout) => return Err(format!("{method} timed out")),
                Err(RecvTimeoutError::Disconnected) => return Err("server exited".into()),
            }
        }
    }
}

impl Drop for Upstream {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[derive(Default)]
struct Gateway {
    upstreams: HashMap<String, Upstream>,
    /// Exposed tool name → (server, the server's own tool name).
    aliases: HashMap<String, (String, String)>,
}

/// Name Devin sees for a server's tool. Model APIs only accept
/// `[A-Za-z0-9_-]` up to 64 characters, while MCP tool names may contain
/// dots or be long — those get sanitized / shortened (with a hash).
fn tool_alias(server: &str, tool: &str) -> String {
    let full: String = format!("{server}{SEP}{tool}")
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '_' || c == '-' { c } else { '_' })
        .collect();
    if full.len() <= 64 {
        return full;
    }
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    (server, tool).hash(&mut h);
    format!("{}_{:08x}", &full[..55], h.finish() as u32)
}

impl Gateway {
    /// The running server for `spec`, (re)started when its config changed.
    fn upstream(&mut self, spec: &ServerSpec) -> Result<&mut Upstream, String> {
        let stale = match self.upstreams.get_mut(&spec.name) {
            Some(u) => u.spec != *spec || !u.alive(),
            None => true,
        };
        if stale {
            self.upstreams.remove(&spec.name);
            self.upstreams.insert(spec.name.clone(), Upstream::start(spec)?);
        }
        Ok(self.upstreams.get_mut(&spec.name).expect("just inserted"))
    }

    /// Stops servers that were removed or disabled.
    fn prune(&mut self, cfg: &Config) {
        self.upstreams
            .retain(|name, _| cfg.servers.iter().any(|s| &s.name == name));
    }

    /// Every tool of `spec`, following `nextCursor` pages.
    fn server_tools(&mut self, spec: &ServerSpec) -> Result<Vec<Value>, String> {
        let up = self.upstream(spec)?;
        let mut tools = Vec::new();
        let mut cursor: Option<String> = None;
        // Bounded, in case a server keeps handing out cursors.
        for _ in 0..50 {
            let params = match &cursor {
                Some(c) => json!({ "cursor": c }),
                None => json!({}),
            };
            let page = up.request("tools/list", params, Duration::from_secs(30))?;
            tools.extend(page.get("tools").and_then(Value::as_array).cloned().unwrap_or_default());
            match page.get("nextCursor").and_then(Value::as_str) {
                Some(c) if !c.is_empty() => cursor = Some(c.to_string()),
                _ => break,
            }
        }
        Ok(tools)
    }

    fn list_tools(&mut self, cfg: &Config) -> Value {
        self.prune(cfg);
        let mut tools = vec![skill_tool(Path::new(&cfg.skills_dir))];
        for spec in &cfg.servers {
            let Ok(listed) = self.server_tools(spec) else { continue };
            for tool in listed {
                let mut tool = tool;
                let name = tool.get("name").and_then(Value::as_str).unwrap_or_default().to_string();
                let desc = tool.get("description").and_then(Value::as_str).unwrap_or_default().to_string();
                let alias = tool_alias(&spec.name, &name);
                self.aliases.insert(alias.clone(), (spec.name.clone(), name));
                tool["name"] = json!(alias);
                tool["description"] = json!(format!("[{}] {desc}", spec.name));
                tools.push(tool);
            }
        }
        json!({ "tools": tools })
    }

    fn call_tool(&mut self, cfg: &Config, params: &Value) -> Value {
        let name = params.get("name").and_then(Value::as_str).unwrap_or_default();
        let args = params.get("arguments").cloned().unwrap_or_else(|| json!({}));
        if name == SKILL_TOOL {
            return load_skill(Path::new(&cfg.skills_dir), &args);
        }
        let Some((server, tool)) = self
            .aliases
            .get(name)
            .cloned()
            .or_else(|| name.split_once(SEP).map(|(s, t)| (s.to_string(), t.to_string())))
        else {
            return tool_result(format!("Unknown tool `{name}`."), true);
        };
        let (server, tool) = (server.as_str(), tool.as_str());
        let Some(spec) = cfg.servers.iter().find(|s| s.name == server) else {
            return tool_result(format!("MCP server `{server}` is not enabled in CoTenk."), true);
        };
        match self.upstream(spec).and_then(|u| {
            u.request(
                "tools/call",
                json!({ "name": tool, "arguments": args }),
                Duration::from_secs(300),
            )
        }) {
            Ok(result) => result,
            Err(e) => tool_result(format!("`{server}` failed: {e}"), true),
        }
    }
}

/// Runs until stdin closes (Devin ended); upstream servers stop with it.
pub fn serve(config_path: &str) {
    let config_path = Path::new(config_path);
    let mut gateway = Gateway::default();
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout();
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        let Ok(msg) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        // Notifications (no id) need no answer.
        let Some(id) = msg.get("id").cloned() else {
            continue;
        };
        let params = msg.get("params").cloned().unwrap_or(Value::Null);
        let cfg = load_config(config_path).filter(authorized);
        let result = match msg.get("method").and_then(Value::as_str).unwrap_or_default() {
            "initialize" => Ok(json!({
                "protocolVersion": params
                    .get("protocolVersion")
                    .cloned()
                    .unwrap_or_else(|| json!(PROTOCOL)),
                "capabilities": { "tools": {} },
                "serverInfo": { "name": "cotenk", "version": env!("CARGO_PKG_VERSION") }
            })),
            "ping" => Ok(json!({})),
            // Outside CoTenk: a server without tools.
            "tools/list" => Ok(match &cfg {
                Some(cfg) => gateway.list_tools(cfg),
                None => json!({ "tools": [] }),
            }),
            "tools/call" => Ok(match &cfg {
                Some(cfg) => gateway.call_tool(cfg, &params),
                None => tool_result("CoTenk tools are only available inside the CoTenk app.".into(), true),
            }),
            other => Err(format!("method not found: {other}")),
        };
        let reply = match result {
            Ok(r) => json!({ "jsonrpc": "2.0", "id": id, "result": r }),
            Err(m) => json!({ "jsonrpc": "2.0", "id": id, "error": { "code": -32601, "message": m } }),
        };
        if writeln!(stdout, "{reply}").and_then(|_| stdout.flush()).is_err() {
            break;
        }
    }
}
