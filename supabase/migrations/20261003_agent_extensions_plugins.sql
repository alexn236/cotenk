-- Plugins: bundles of skills and MCP servers in Settings → Skills & MCP.
-- `data` holds {description, skills: [...], servers: [...]}; like for MCP
-- servers, secret values never reach this table.

alter table public.agent_extensions
  drop constraint if exists agent_extensions_kind_check;
alter table public.agent_extensions
  add constraint agent_extensions_kind_check
  check (kind in ('skill', 'mcp', 'plugin'));
