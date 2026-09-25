-- Chats can talk to different local agents (Devin CLI, Claude Code).
-- Existing chats were all Devin chats. The app keeps working without
-- this column (it falls back to "devin"), but the choice isn't saved.

alter table public.agent_chats
  add column if not exists agent text not null default 'devin';
