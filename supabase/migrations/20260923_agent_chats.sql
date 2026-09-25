-- Agent chats & projects for the Agents rail section.
-- Chats may live inside a project or unfiled (project_id null).

create table if not exists public.agent_projects (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Project',
  created_at timestamptz not null default now()
);

create table if not exists public.agent_chats (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id text references public.agent_projects(id) on delete set null,
  title text not null default 'New chat',
  model text not null default '',
  pinned boolean not null default false,
  messages jsonb not null default '[]'::jsonb,
  acp_session_id text,
  updated_at bigint not null default 0,
  created_at timestamptz not null default now()
);

alter table public.agent_projects enable row level security;
alter table public.agent_chats enable row level security;

create policy "agent_projects_select" on public.agent_projects
  for select using (auth.uid() = user_id);
create policy "agent_projects_insert" on public.agent_projects
  for insert with check (auth.uid() = user_id);
create policy "agent_projects_update" on public.agent_projects
  for update using (auth.uid() = user_id);
create policy "agent_projects_delete" on public.agent_projects
  for delete using (auth.uid() = user_id);

create policy "agent_chats_select" on public.agent_chats
  for select using (auth.uid() = user_id);
create policy "agent_chats_insert" on public.agent_chats
  for insert with check (auth.uid() = user_id);
create policy "agent_chats_update" on public.agent_chats
  for update using (auth.uid() = user_id);
create policy "agent_chats_delete" on public.agent_chats
  for delete using (auth.uid() = user_id);

create index if not exists agent_chats_user_updated
  on public.agent_chats (user_id, updated_at desc);
create index if not exists agent_chats_project
  on public.agent_chats (project_id);
