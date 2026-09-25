# CoTenk

Think together. Work together. — An open workspace where people and AI
agents share documents, tasks and context.

Desktop app built with **Tauri + React + TypeScript + Tailwind CSS**.
The Devin agent is embedded via ACP (`devin acp`) — the Rust backend
spawns and owns the subprocess, the frontend speaks JSON-RPC over it.

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

Database: apply the SQL files in `supabase/migrations/` (agent chats and
the marketplace). Without the marketplace migration the app still runs —
only community listings and publishing are unavailable.
