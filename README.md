# CoTenk

Think together. Work together. — An open workspace where people and AI
agents share documents, tasks and context.

Desktop app built with **Tauri + React + TypeScript + Tailwind CSS**.
Local agents are embedded via ACP — the built-in **CoTenk Agent**
([OpenCode](https://github.com/sst/opencode), `opencode acp`, with your
own API key), **Claude Code** (through the
`@agentclientprotocol/claude-agent-acp` adapter) and **Devin CLI**
(`devin acp`). The Rust backend spawns and owns one subprocess per
agent, the frontend speaks JSON-RPC over it. Each chat is bound to one
agent; Settings → Agents shows the connection state and the default.
On first start the desktop app asks which agents to use and walks
through setting each one up (`src/components/agents/agent-onboarding.tsx`).

### Skills & MCP servers

Settings → Skills & MCP manages skills and MCP servers that are **only
usable inside CoTenk** — nothing goes into `~/.claude` or Devin's user
config, so `claude` / `devin` run outside the app can't use them:

- **CoTenk Agent** — its whole config travels in the process
  environment (`OPENCODE_CONFIG_CONTENT`, merged over any
  `opencode.json`): the chosen provider and key, `permission` set to ask
  for edits and commands, and `skills.paths` pointing at CoTenk's skills
  folder. MCP servers go into `mcpServers` of `session/new`. Nothing is
  written to `~/.config/opencode` or the workspace.
- **Claude Code** — everything is handed over per ACP session
  (`session/new`): skills are written to
  `<app data>/extensions/cotenk/` and loaded as a session plugin
  (`_meta.claudeCode.options.plugins`, skills appear as `cotenk:<name>`);
  MCP servers go into `mcpServers` (command or URL).
- **Devin CLI** — ignores `mcpServers` from `session/new` (tested with
  3000.10.31: the processes may start, but the model can't reach them).
  So the workspace's `.devin/mcp_config.local.json` lists one server,
  the CoTenk gateway (`cotenk --mcp-gateway <config>`, see
  `src-tauri/src/mcp_gateway.rs`). It offers `load_skill` and proxies the
  enabled MCP servers as `<server>__<tool>` (URL servers through
  `npx mcp-remote`) — but only to Devin processes CoTenk started with
  this run's `COTENK_GATEWAY_TOKEN`. A plain `devin` in the workspace
  sees the server with no tools.

The workspace guide (`src/lib/agent/cotenk-skill.md`) ships the same way
as the built-in `cotenk-workspace` skill. Signed in, the list syncs to
Supabase (`agent_extensions`, migration `20261002_agent_extensions.sql`);
secret values (env vars, headers) stay on the device.

### CoTenk Agent setup

Needs only an API key (Anthropic, OpenAI, OpenRouter, Google, DeepSeek
or Mistral), pasted in onboarding or Settings → Agents. Keys are stored
per provider on the device and never sync. OpenCode starts from a
global install (`npm install -g opencode-ai`, or `OPENCODE_BIN`) and
otherwise through `npx -y opencode-ai acp`, so Node.js is the only
requirement.

### Claude Code setup

The app walks through this itself: Home → "Connect an agent" (or
Settings → Agents → Set up) checks Node.js, runs the npm install in a
terminal window and starts the sign-in. By hand:

```bash
npm install -g @anthropic-ai/claude-code          # the CLI
claude auth login                                  # or "Connect" in Settings → Agents
npm install -g @agentclientprotocol/claude-agent-acp   # optional: faster start
```

Without the global adapter the app falls back to `npx -y
@agentclientprotocol/claude-agent-acp` (first start takes ~10 s).
`CLAUDE_ACP_BIN` overrides the adapter command, `DEVIN_CLI` the Devin one.

Agent edits and commands are **reviewed** by default: the app shows the
change as a block diff and asks before it lands (Settings → Agents →
Agent changes → Auto-approve turns that off). Reads never ask.

## What's inside

- **Pages** — Notion-style block editor on top of plain markdown. Slash
  menu (`/`) for headings, to-dos, tables, callouts, code and embeds.
- **Interactive embeds** — self-contained HTML blocks rendered in a
  sandboxed iframe. The app theme is injected as `--ck-*` CSS variables
  so agent-built widgets match light and dark mode. Widgets keep state
  across reloads with `cotenk.save(data)` / `cotenk.state` (stored in
  the block itself).
- **Import** — drop a Notion export (.zip), an Obsidian vault or .md
  files anywhere on the window (or Import notes in the sidebar/palette).
  Links become `[[wikilinks]]`, Notion CSV databases become tables.
- **Page links** — `[[Page title]]` links pages; every page lists its
  backlinks under “Linked from”. Pages can be dragged into folders.
- **Agents in the workspace** — "Ask agent" on every page, "Hand to
  agent" on every task. The agent edits the real file on disk; the open
  page follows the change live and Ctrl+Z reverts it.
- **Tasks** — every `- [ ]` across all pages, with `@owner` and
  `due:YYYY-MM-DD` markers, grouped by page or due date, filterable by
  person or agent. The Board view is a kanban by due date; dragging a
  card re-dates (or ticks off) the task in its page.
- **Marketplace** — curated templates, community listings and "Build
  with AI" (describe a page, the agent builds it).
- **Command palette** — Ctrl/⌘+K: search pages, run actions, ask the agent.
- **No account required** — the app opens straight into the workspace.
  Signed out, pages belong to the device: cached in the browser and
  mirrored to the local workspace folder on desktop. Agents run locally
  either way.
- **Accounts and workspaces** — every account has its own workspace
  (Supabase, live sync via Realtime) and, on desktop, its own folder
  (`~/Documents/CoTenk (name)`). Signing in never mixes pages: after the
  first pull a dialog asks whether to move the device's local pages into
  the account. Signing out switches back to the local workspace. Pages
  and folders are keyed by `(workspace_id, id)` and access follows
  `workspace_members` (owner / editor / viewer) — shared workspaces only
  need an invite flow on top. A display name (Settings → Account) is
  what the marketplace shows; the email never is. Forgotten passwords
  are reset with a code from the email (or its link on the web).
- **Getting started** — one checklist on Home (the app opens there
  until it's done): connect an agent, watch it edit a page, bring your
  notes.

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
`VITE_SUPABASE_PUBLISHABLE_KEY` for auth + sync. Optional:
`VITE_POSTHOG_KEY` (+ `VITE_POSTHOG_HOST`, default
`https://eu.i.posthog.com`) turns on the activation analytics in
`src/lib/analytics.ts`; `VITE_DESKTOP_DOWNLOAD_URL` is where the web
app sends people for the desktop app.

Database: apply the SQL files in `supabase/migrations/` in order
(agent chats, the marketplace, the per-chat agent column, public
marketplace reads, the realtime publication for docs/folders, and
`20260928_workspaces_profiles.sql` — docs/folders schema, workspaces,
members and profiles). **The workspaces migration is required for
signing in**: without it the account can't load its workspace and the
app shows a sync error (local work is unaffected). Without the
marketplace migration only community listings and publishing are
unavailable; without `20260925_agent_kind.sql` chats load as Devin
chats after a reload.

Password reset on desktop needs the code in the email: in Supabase →
Authentication → Email Templates → Reset Password, add `{{ .Token }}`
to the template (the default one only has the link). On the web, add
the app's URL to Authentication → URL Configuration → Redirect URLs so
the link lands on the "Set a new password" screen.
