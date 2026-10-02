-- Live sync between devices: the app subscribes to row changes of its
-- own docs/folders (RLS still applies to realtime). Without this the app
-- falls back to re-pulling on window focus.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'docs'
  ) then
    alter publication supabase_realtime add table public.docs;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'folders'
  ) then
    alter publication supabase_realtime add table public.folders;
  end if;
end $$;
