-- Skills and MCP servers from Settings → Skills & MCP, per user.
-- They are handed to Claude Code / Devin CLI only inside CoTenk sessions.
-- `data` holds the kind-specific fields: skills {description, body},
-- MCP servers {transport, command, args, url, secretKeys}. Secret values
-- (env vars, headers) never reach this table — they stay on the device.

create table if not exists public.agent_extensions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('skill', 'mcp')),
  name text not null,
  enabled boolean not null default true,
  data jsonb not null default '{}'::jsonb,
  updated_at bigint not null default 0,
  created_at timestamptz not null default now()
);

alter table public.agent_extensions enable row level security;

create policy "agent_extensions_select" on public.agent_extensions
  for select using (auth.uid() = user_id);
create policy "agent_extensions_insert" on public.agent_extensions
  for insert with check (auth.uid() = user_id);
create policy "agent_extensions_update" on public.agent_extensions
  for update using (auth.uid() = user_id);
create policy "agent_extensions_delete" on public.agent_extensions
  for delete using (auth.uid() = user_id);

create index if not exists agent_extensions_user
  on public.agent_extensions (user_id);
