-- Version history + trash, subpages, unused-file lookup, account deletion.

-- ---------------------------------------------------------------------
-- Subpages
-- ---------------------------------------------------------------------

alter table public.docs add column if not exists parent_id text;

-- ---------------------------------------------------------------------
-- Version history and "recently deleted"
-- ---------------------------------------------------------------------
-- Filled by a trigger, so it works no matter which client (or sync bug)
-- changes or deletes a page. `edit` rows hold the page as it was before
-- an editing burst (at most one per 10 minutes, newest 40 kept);
-- `delete` rows hold the last state of a deleted page (60 days).
-- Clients may add `edit` rows themselves (the app saves the current
-- state before restoring an older version).

create table if not exists public.doc_versions (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  doc_id text not null,
  folder_id text,
  parent_id text,
  title text not null default '',
  content text not null default '',
  pinned boolean not null default false,
  reason text not null check (reason in ('edit', 'delete')),
  doc_updated_at bigint not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists doc_versions_doc
  on public.doc_versions (workspace_id, doc_id, created_at desc);

alter table public.doc_versions enable row level security;

drop policy if exists doc_versions_select on public.doc_versions;
drop policy if exists doc_versions_insert on public.doc_versions;
drop policy if exists doc_versions_delete on public.doc_versions;
create policy doc_versions_select on public.doc_versions
  for select using (public.can_read_workspace(workspace_id));
create policy doc_versions_insert on public.doc_versions
  for insert with check (
    public.can_write_workspace(workspace_id) and reason = 'edit'
  );
create policy doc_versions_delete on public.doc_versions
  for delete using (public.can_write_workspace(workspace_id));

create or replace function public.snapshot_doc()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  last_at timestamptz;
begin
  -- The whole workspace is being deleted (account deletion): nothing to keep.
  if not exists (select 1 from public.workspaces where id = old.workspace_id) then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    insert into public.doc_versions
      (workspace_id, doc_id, folder_id, parent_id, title, content, pinned, reason, doc_updated_at)
    values
      (old.workspace_id, old.id, old.folder_id, old.parent_id, old.title, old.content, old.pinned, 'delete', old.updated_at);
    delete from public.doc_versions
     where workspace_id = old.workspace_id and reason = 'delete'
       and created_at < now() - interval '60 days';
    return old;
  end if;

  if (old.content is distinct from new.content or old.title is distinct from new.title)
     and (old.content <> '' or old.title <> '') then
    select max(created_at) into last_at
      from public.doc_versions
     where workspace_id = old.workspace_id and doc_id = old.id and reason = 'edit';
    if last_at is null or last_at < now() - interval '10 minutes' then
      insert into public.doc_versions
        (workspace_id, doc_id, folder_id, parent_id, title, content, pinned, reason, doc_updated_at)
      values
        (old.workspace_id, old.id, old.folder_id, old.parent_id, old.title, old.content, old.pinned, 'edit', old.updated_at);
      delete from public.doc_versions
       where id in (
         select id from public.doc_versions
          where workspace_id = old.workspace_id and doc_id = old.id and reason = 'edit'
          order by created_at desc offset 40
       );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists docs_snapshot on public.docs;
create trigger docs_snapshot
  before update or delete on public.docs
  for each row execute function public.snapshot_doc();

-- ---------------------------------------------------------------------
-- Files still referenced (pages, their versions, chats) — everything else
-- in the `note-images` bucket can be cleaned up.
-- ---------------------------------------------------------------------

create or replace function public.referenced_note_files(ws uuid)
returns setof text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_read_workspace(ws) then
    raise exception 'not allowed';
  end if;
  return query
  select distinct t.m[1]
    from (
      select regexp_matches(content, 'cotenk-(?:image|file):([^)\s"#]+)', 'g') as m
        from public.docs where workspace_id = ws
      union all
      select regexp_matches(content, 'cotenk-(?:image|file):([^)\s"#]+)', 'g')
        from public.doc_versions where workspace_id = ws
      union all
      select regexp_matches(messages::text, 'cotenk-(?:image|file):([^)\s"#\\]+)', 'g')
        from public.agent_chats
       where user_id in (select user_id from public.workspace_members where workspace_id = ws)
    ) t;
end;
$$;

revoke execute on function public.referenced_note_files(uuid) from public, anon;
grant execute on function public.referenced_note_files(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Account deletion (the app removes the stored files first)
-- ---------------------------------------------------------------------

create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  -- Everything the user owns hangs off auth.users with ON DELETE CASCADE
  -- (workspaces → pages/folders/versions, chats, extensions, listings).
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;

-- ---------------------------------------------------------------------
-- The bucket also holds file attachments now
-- ---------------------------------------------------------------------

update storage.buckets
   set allowed_mime_types = null,
       file_size_limit = 26214400
 where id = 'note-images';
