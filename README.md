<div align="center">

<img src="app-icon.png" width="88" alt="CoTenk logo">

# CoTenk

### The open-source ChatGPT Spaces — on your machine, with your own agents.

One space for your notes, tasks and AI agents. Your agent doesn't chat *about*
your work — it opens the page and writes into it, while you watch.

[![MIT License](https://img.shields.io/badge/license-MIT-a8641c.svg)](LICENSE)
[![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%202-24C8DB.svg)](https://tauri.app)
[![Agents: Claude Code · Devin](https://img.shields.io/badge/agents-Claude%20Code%20%C2%B7%20Devin%20CLI-e2a05c.svg)](#-why-cotenk)
[![Local-first](https://img.shields.io/badge/local--first-no%20account-232a20.svg)](#-why-cotenk)

[Quick start](#-quick-start) · [Why CoTenk](#-why-cotenk) · [Features](#-what-you-get) · [Docs](#-docs)

<br>

<img src="docs/screenshots/agent-edit.png" alt="Claude Code writing into a page in CoTenk — every block it wrote lights up" width="900">

<sub>Claude Code writing into a page. Every block it touched lights up — <kbd>Ctrl</kbd> <kbd>Z</kbd> takes it back.</sub>

</div>

<br>

## 💡 Why CoTenk

AI workspaces are great — until you notice your notes live on someone
else's server, in a format you can't take with you, with an assistant you
didn't choose.

CoTenk flips that:

- **🗂️ Your files, not our cloud.** Every page is a plain `.md` file in a
  folder on your disk. No account. No server. No telemetry. Open it in
  Obsidian, put it in git, grep it.
- **🤖 Bring your own agent.** Claude Code or Devin CLI — the agents you
  already pay for and trust. They work on the real files, with your skills
  and MCP servers.
- **✍️ Agents that write, not just talk.** Ask on any page, hand off any
  task. The agent edits the page live, ticks the task off when it's done,
  and asks before it changes anything.

> **Think together. Work together.** A space where you and your agents share
> the same pages, the same tasks and the same context.

| | Hosted AI spaces | **CoTenk** |
| --- | :---: | :---: |
| Open source | ❌ | ✅ MIT |
| Your notes stay on your machine | ❌ | ✅ |
| Plain markdown you can take anywhere | ❌ | ✅ |
| Use the agent CLI you already have (Claude Code, Devin) | ❌ | ✅ |
| Agent edits real files, live | ❌ | ✅ |
| No account — notes work offline | ❌ | ✅ |

## ✨ What you get

- **Pages** — a Notion-style block editor on plain markdown. `/` for
  headings, to-dos, tables, callouts, code, images and files.
- **Live agent edits** — blocks an agent writes glow as they land. Review
  every change as a diff, undo with one key.
- **Tasks everywhere** — any `- [ ]` on any page is a task. `@claude` it
  and the agent does it. List or kanban board by due date.
- **Interactive pages** — agents build widgets (charts, trackers, timers)
  as plain HTML right inside your notes.
- **Graph** — your pages, folders, people and agents as a live map.
- **Build with AI** — describe a page, your agent builds it. Or start
  from a template.
- **Import in seconds** — drop a Notion export or an Obsidian vault on
  the window.
- **Yours to keep** — version history, recently deleted, one-click
  export of everything.

## 🚀 Quick start

**Download** the app for Windows, macOS or Linux from
[Releases](https://github.com/alexn236/cotenk/releases/latest) — or build it yourself:

```bash
git clone https://github.com/alexn236/cotenk.git
cd cotenk
npm install
npm run tauri:dev
```

Then click **Connect an agent** on Home — CoTenk installs Claude Code (or
finds Devin CLI) and walks you through sign-in. That's it.

> Needs Node.js, Rust and the [Tauri prerequisites](https://tauri.app/start/prerequisites/).
> Just want to look around? `npm run dev` runs it in the browser (without agents).

## 🤝 Contributing

CoTenk is early and moving fast — issues, ideas and PRs are welcome. If
it's useful to you, a ⭐ helps other people find it.

## 📚 Docs

<details>
<summary><b>How it works</b></summary>

<br>

Desktop app built with **Tauri + React + TypeScript + Tailwind CSS**.
Agents run locally through the [Agent Client Protocol](https://agentclientprotocol.com)
(ACP): the Rust backend spawns one subprocess per agent, the frontend
speaks JSON-RPC over it. Each chat is bound to one agent.

- **Claude Code** — through the `@agentclientprotocol/claude-agent-acp`
  adapter, using your Claude login.
- **Devin CLI** — `devin acp`, using your Devin login.

#### Where data lives

| What | Desktop | Browser (`npm run dev`) |
| --- | --- | --- |
| Pages | workspace folder (`.md` + frontmatter) and a local cache | `localStorage` |
| Images and files | `<workspace>/assets/` | small images inline as data URLs |
| Chats, history, settings | `localStorage` of the app | `localStorage` |
| Skills & MCP servers | app data folder (`extensions/`) | — |

Every file the app writes carries a small frontmatter block so a page
keeps its identity across renames and moves:

```markdown
---
cotenk-id: <page id>
title: <page title>
folder: <folder name or empty>
pinned: true|false
---

<markdown body>
```

Markdown files without `cotenk-id` that appear in the folder (dropped in
by you or an agent) are adopted as new pages, never deleted.

</details>

<details>
<summary><b>Setting up an agent</b></summary>

<br>

The app walks through this itself: Home → "Connect an agent" (or
Settings → Agents → Set up) checks Node.js, runs the npm install in a
terminal window and starts the sign-in. By hand:

#### Claude Code

```bash
npm install -g @anthropic-ai/claude-code              # the CLI
claude auth login                                      # or "Connect" in Settings → Agents
npm install -g @agentclientprotocol/claude-agent-acp   # optional: faster start
```

Without the global adapter the app falls back to `npx -y
@agentclientprotocol/claude-agent-acp` (first start takes ~10 s).
`CLAUDE_ACP_BIN` overrides the adapter command.

#### Devin CLI

Install Devin CLI with its own installer and sign in (`devin auth
login`, or "Connect" in Settings → Agents). `DEVIN_CLI` overrides the
binary. An API key can also be pasted in Settings → Agents.

Agent edits and commands are **reviewed** by default: the app shows the
change as a block diff and asks before it lands (Settings → Agents →
Agent changes → Auto-approve turns that off). Reads never ask.

#### Skills & MCP servers

Settings → Agent customisation manages skills and MCP servers that are
**only usable inside CoTenk** — nothing goes into `~/.claude` or Devin's
user config, so `claude` / `devin` run outside the app can't use them:

- **Claude Code** — everything is handed over per ACP session
  (`session/new`): skills are written to
  `<app data>/extensions/cotenk/` and loaded as a session plugin
  (`_meta.claudeCode.options.plugins`, skills appear as `cotenk:<name>`);
  MCP servers go into `mcpServers` (command or URL).
- **Devin CLI** — ignores `mcpServers` from `session/new`. So the
  workspace's `.devin/mcp_config.local.json` lists one server, the
  CoTenk gateway (`cotenk --mcp-gateway <config>`, see
  `src-tauri/src/mcp_gateway.rs`). It offers `load_skill` and proxies
  the enabled MCP servers as `<server>__<tool>` (URL servers through
  `npx mcp-remote`) — but only to Devin processes CoTenk started with
  this run's `COTENK_GATEWAY_TOKEN`. A plain `devin` in the workspace
  sees the server with no tools.

The workspace guide (`src/lib/agent/cotenk-skill.md`) ships the same way
as the built-in `cotenk-workspace` skill. Secret values (env vars,
headers) are stored apart from the list.

</details>

<details>
<summary><b>Development</b></summary>

<br>

Prerequisites: Node.js, Rust (`rustup`) and the
[Tauri prerequisites](https://tauri.app/start/prerequisites/) for your
OS (on Windows the MSVC build tools, on Linux `libwebkit2gtk-4.1-dev`
and friends).

```bash
npm install
npm run tauri:dev    # vite dev server + desktop window
npm run dev          # frontend only, in the browser (agents disabled)
npm run typecheck    # tsc
npm run lint         # eslint
npm run build        # production frontend bundle → dist/
npm run tauri:build  # packaged desktop app
```

No environment variables are required. Optional:
`VITE_DESKTOP_DOWNLOAD_URL` is where the browser build sends people for
the desktop app (defaults to this repository's latest release).

#### Project layout

```
src/
  components/   React views (editor, agents, tasks, settings, shell, …)
  lib/          state (zustand stores), file mirror, ACP client, importer, …
src-tauri/
  src/lib.rs          agent processes, file system, watcher
  src/mcp_gateway.rs  MCP gateway for Devin CLI
```

</details>

## 📄 License

[MIT](LICENSE) — do whatever you want, just keep the notice.
