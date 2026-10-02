-- Workspaces, members and profiles — and docs/folders keyed per workspace.
--
-- Until now every row belonged to one user (user_id) and docs/folders
-- used the page id alone as their key. The seed pages carry fixed ids
-- (d-welcome-v2, f-product, …), so a second account could not upload
-- its welcome page: the upsert hit the first account's row and RLS
-- refused it — the whole batch failed and sync stayed on "error".
--
-- After this migration:
--   * docs/folders belong to a workspace; the key is (workspace_id, id).
--   * every user has a personal workspace (created on sign-up, backfilled
--     for existing accounts) and is its owner.
--   * access follows workspace_members (owner / editor / viewer), so
--     shared workspaces only need an invite flow on top.
--   * profiles carry a display name — the marketplace no longer shows
--     the local part of people's email addresses.
--
-- Safe to run on a database where docs/folders were created by hand:
-- the tables are created if missing, and existing keys, foreign keys
-- and policies on them are replaced.

-- ---------------------------------------------------------------------
-- Baseline docs/folders (they were never part of the migrations)
-- ---------------------------------------------------------------------

create table if not exists public.folders (
  id text not null,
  user_id uuid default auth.uid(),
  name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.docs (
  id text not null,
  user_id uuid default auth.uid(),
  folder_id text,
  title text not null default '',
  content text not null default '',
  pinned boolean not null default false,
  updated_at bigint not null default 0,
  created_at timestamptz not null default now()
);

alter table public.folders add column if not exists created_at timestamptz not null default now();
alter table public.docs add column if not exists created_at timestamptz not null default now();

-- user_id now means "created by". It defaults to the caller, and a
-- member leaving CoTenk must not take shared pages with them.
alter table public.folders alter column user_id set default auth.uid();
alter table public.docs alter column user_id set default auth.uid();
alter table public.folders alter column user_id drop not null;
alter table public.docs alter column user_id drop not null;

alter table public.docs enable row level security;
alter table public.folders enable row level security;

-- ---------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default ''
    check (char_length(display_name) <= 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- ---------------------------------------------------------------------
-- Workspaces and members
-- ---------------------------------------------------------------------

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Personal'
    check (char_length(name) between 1 and 80),
  owner_id uuid not null references auth.users(id) on delete cascade,
  personal boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists workspaces_one_personal
  on public.workspaces (owner_id) where personal;

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor'
    check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists workspace_members_user
  on public.workspace_members (user_id);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

-- Role lookups for policies. security definer so policies on
-- workspace_members can use them without recursing into themselves.
create or replace function public.workspace_role(ws uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.workspace_members
   where workspace_id = ws and user_id = auth.uid();
$$;

create or replace function public.can_read_workspace(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.workspace_role(ws) is not null;
$$;

create or replace function public.can_write_workspace(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.workspace_role(ws) in ('owner', 'editor'), false);
$$;

/** True when the caller and `other` are members of a common workspace. */
create or replace function public.shares_workspace(other uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.workspace_members a
      join public.workspace_members b on b.workspace_id = a.workspace_id
     where a.user_id = auth.uid() and b.user_id = other
  );
$$;

-- The creator of a workspace becomes its owner.
create or replace function public.add_workspace_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (workspace_id, user_id) do update set role = 'owner';
  return new;
end;
$$;

drop trigger if exists workspaces_add_owner on public.workspaces;
create trigger workspaces_add_owner
  after insert on public.workspaces
  for each row execute function public.add_workspace_owner();

-- Personal workspace of a user, created on first use. Internal — the
-- app calls ensure_personal_workspace() below.
create or replace function public.ensure_personal_workspace_for(uid uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  ws uuid;
begin
  select id into ws from public.workspaces where owner_id = uid and personal;
  if ws is null then
    insert into public.workspaces (name, owner_id, personal)
    values ('Personal', uid, true)
    on conflict do nothing
    returning id into ws;
    -- Lost a race against a concurrent call.
    if ws is null then
      select id into ws from public.workspaces where owner_id = uid and personal;
    end if;
  end if;
  insert into public.workspace_members (workspace_id, user_id, role)
  values (ws, uid, 'owner')
  on conflict (workspace_id, user_id) do nothing;
  return ws;
end;
$$;

revoke execute on function public.ensure_personal_workspace_for(uuid)
  from public, anon, authenticated;

create or replace function public.ensure_personal_workspace()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  insert into public.profiles (id) values (auth.uid())
  on conflict (id) do nothing;
  return public.ensure_personal_workspace_for(auth.uid());
end;
$$;

revoke execute on function public.ensure_personal_workspace() from public, anon;
grant execute on function public.ensure_personal_workspace() to authenticated;

-- New accounts get a profile (display name from sign-up) and their
-- personal workspace right away.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 60)
  )
  on conflict (id) do nothing;
  perform public.ensure_personal_workspace_for(new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill existing accounts.
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

do $$
declare
  u record;
begin
  for u in select id from auth.users loop
    perform public.ensure_personal_workspace_for(u.id);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- docs/folders → workspace-scoped
-- ---------------------------------------------------------------------

alter table public.docs
  add column if not exists workspace_id uuid
  references public.workspaces(id) on delete cascade;
alter table public.folders
  add column if not exists workspace_id uuid
  references public.workspaces(id) on delete cascade;

update public.docs d
   set workspace_id = w.id
  from public.workspaces w
 where d.workspace_id is null and w.owner_id = d.user_id and w.personal;
update public.folders f
   set workspace_id = w.id
  from public.workspaces w
 where f.workspace_id is null and w.owner_id = f.user_id and w.personal;

-- Rows without an owner can't be placed in any workspace.
delete from public.docs where workspace_id is null;
delete from public.folders where workspace_id is null;

alter table public.docs alter column workspace_id set not null;
alter table public.folders alter column workspace_id set not null;

-- Replace whatever keys, foreign keys and policies the hand-made tables
-- had: ids are only unique inside a workspace now.
do $$
declare
  r record;
begin
  for r in
    select policyname, tablename from pg_policies
     where schemaname = 'public' and tablename in ('docs', 'folders')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;

  for r in
    select conname, conrelid::regclass as tbl from pg_constraint
     where contype = 'f'
       and conrelid in ('public.docs'::regclass, 'public.folders'::regclass)
       and confrelid in ('public.folders'::regclass, 'auth.users'::regclass)
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;

  for r in
    select conname, conrelid::regclass as tbl from pg_constraint
     where contype in ('p', 'u')
       and conrelid in ('public.docs'::regclass, 'public.folders'::regclass)
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

alter table public.docs add primary key (workspace_id, id);
alter table public.folders add primary key (workspace_id, id);

alter table public.docs
  add constraint docs_user_id_fkey foreign key (user_id)
  references auth.users(id) on delete set null;
alter table public.folders
  add constraint folders_user_id_fkey foreign key (user_id)
  references auth.users(id) on delete set null;

create index if not exists docs_workspace_updated
  on public.docs (workspace_id, updated_at desc);

-- Realtime DELETE events carry only the primary key — with the new key
-- that includes workspace_id, so clients can tell which workspace a
-- delete belongs to (they can't be filtered server-side).

-- ---------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------

create policy docs_select on public.docs
  for select using (public.can_read_workspace(workspace_id));
create policy docs_insert on public.docs
  for insert with check (
    public.can_write_workspace(workspace_id)
    and (user_id is null or user_id = auth.uid())
  );
create policy docs_update on public.docs
  for update using (public.can_write_workspace(workspace_id))
  with check (public.can_write_workspace(workspace_id));
create policy docs_delete on public.docs
  for delete using (public.can_write_workspace(workspace_id));

create policy folders_select on public.folders
  for select using (public.can_read_workspace(workspace_id));
create policy folders_insert on public.folders
  for insert with check (
    public.can_write_workspace(workspace_id)
    and (user_id is null or user_id = auth.uid())
  );
create policy folders_update on public.folders
  for update using (public.can_write_workspace(workspace_id))
  with check (public.can_write_workspace(workspace_id));
create policy folders_delete on public.folders
  for delete using (public.can_write_workspace(workspace_id));

drop policy if exists workspaces_select on public.workspaces;
drop policy if exists workspaces_insert on public.workspaces;
drop policy if exists workspaces_update on public.workspaces;
drop policy if exists workspaces_delete on public.workspaces;
create policy workspaces_select on public.workspaces
  for select using (public.can_read_workspace(id));
-- Shared workspaces can be created directly; personal ones only via
-- ensure_personal_workspace().
create policy workspaces_insert on public.workspaces
  for insert with check (owner_id = auth.uid() and not personal);
create policy workspaces_update on public.workspaces
  for update using (public.workspace_role(id) = 'owner')
  with check (public.workspace_role(id) = 'owner' and owner_id = auth.uid());
create policy workspaces_delete on public.workspaces
  for delete using (public.workspace_role(id) = 'owner' and not personal);

drop policy if exists members_select on public.workspace_members;
drop policy if exists members_insert on public.workspace_members;
drop policy if exists members_update on public.workspace_members;
drop policy if exists members_delete on public.workspace_members;
create policy members_select on public.workspace_members
  for select using (public.can_read_workspace(workspace_id));
-- Owners manage members; the owner row itself is never touched here.
create policy members_insert on public.workspace_members
  for insert with check (
    public.workspace_role(workspace_id) = 'owner' and role <> 'owner'
  );
create policy members_update on public.workspace_members
  for update using (
    public.workspace_role(workspace_id) = 'owner' and role <> 'owner'
  )
  with check (role <> 'owner');
-- Owners remove members; members may leave on their own.
create policy members_delete on public.workspace_members
  for delete using (
    role <> 'owner'
    and (public.workspace_role(workspace_id) = 'owner' or user_id = auth.uid())
  );

drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_update on public.profiles;
create policy profiles_select on public.profiles
  for select using (id = auth.uid() or public.shares_workspace(id));
create policy profiles_insert on public.profiles
  for insert with check (id = auth.uid());
create policy profiles_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------------
-- Marketplace: stop showing email addresses
-- ---------------------------------------------------------------------

-- Listings published so far used the part of the email before the "@"
-- as author. Those become the display name (or "Anonymous"); authors
-- someone typed themselves are left alone.
do $$
begin
  if to_regclass('public.marketplace_listings') is not null then
    update public.marketplace_listings l
       set author = coalesce(nullif(p.display_name, ''), 'Anonymous')
      from auth.users u
      left join public.profiles p on p.id = u.id
     where u.id = l.user_id
       and l.author = split_part(u.email, '@', 1);
  end if;
end $$;
