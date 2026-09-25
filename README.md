# CoTenk

Think together. Work together. — An open workspace where people and AI
agents share documents, tasks and context.

Desktop app built with **Tauri + React + TypeScript + Tailwind CSS**.
Local agents are embedded via ACP — **Claude Code** (through the
`@agentclientprotocol/claude-agent-acp` adapter) and **Devin CLI**
(`devin acp`). The Rust backend spawns and owns one subprocess per
agent, the frontend speaks JSON-RPC over it. Each chat is bound to one
agent; Settings → Agents shows the connection state and the default.

Agents get a workspace guide: `src/lib/agent/cotenk-skill.md` is copied
to `<workspace>/.claude/skills/cotenk-workspace/SKILL.md` before an
agent starts (Claude Code loads it as a skill; the first-turn preamble
points every other agent to it).

### Claude Code setup

```bash
npm install -g @anthropic-ai/claude-code          # the CLI
claude auth login                                  # or "Connect" in Settings → Agents
npm install -g @agentclientprotocol/claude-agent-acp   # optional: faster start
```

Without the global adapter the app falls back to `npx -y
@agentclientprotocol/claude-agent-acp` (first start takes ~10 s).
`CLAUDE_ACP_BIN` overrides the adapter command, `DEVIN_CLI` the Devin one.

## What's inside

- **Pages** — Notion-style block editor on top of plain markdown. Slash
  menu (`/`) for headings, to-dos, tables, callouts, code and embeds.
- **Interactive embeds** — self-contained HTML blocks rendered in a
  sandboxed iframe. The app theme is injected as `--ck-*` CSS variables
  so agent-built widgets match light and dark mode.
- **Agents in the workspace** — "Ask agent" on every page, "Hand to
  agent" on every task. The agent edits the real file on disk; the open
  page follows the change live and Ctrl+Z reverts it.
- **Tasks** — every `- [ ]` across all pages, with `@owner` and
  `due:YYYY-MM-DD` markers, grouped by page or due date, filterable by
  person or agent.
- **Marketplace** — curated templates, community listings and "Build
  with AI" (describe a page, the agent builds it).
- **Command palette** — Ctrl/⌘+K: search pages, run actions, ask the agent.

## Development

Prerequisites: Node.js, Rust (`rustup`), and on Windows the MSVC build
tools (Visual Studio Build Tools with the C++ workload).

```bash
npm install
npm run tauri:dev    # vite dev server + desktop window
npm run dev          # frontend only, in the browser (agent disabled)
npm run build        # production frontend bundle → dist/
npm run tauri:build  # packaged desktop app (Windows/macOS)
```

Environment: copy `.env.local` — needs `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` for auth + sync.

Database: apply the SQL files in `supabase/migrations/` (agent chats,
the marketplace, the per-chat agent column). Without the marketplace
migration the app still runs — only community listings and publishing
are unavailable; without `20260925_agent_kind.sql` chats load as Devin
chats after a reload.
