-- Marketplace: pages people publish for others to install.
-- Listings are readable by every signed-in user, writable by their owner.
-- price_cents is stored for the upcoming paid tier; the app only
-- publishes free listings for now (0).

create table if not exists public.marketplace_listings (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  author text not null default '',
  title text not null,
  description text not null default '',
  category text not null default 'Planning',
  content text not null,
  price_cents integer not null default 0 check (price_cents >= 0),
  installs integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.marketplace_listings enable row level security;

create policy "marketplace_select" on public.marketplace_listings
  for select to authenticated using (true);
create policy "marketplace_insert" on public.marketplace_listings
  for insert with check (auth.uid() = user_id);
create policy "marketplace_update" on public.marketplace_listings
  for update using (auth.uid() = user_id);
create policy "marketplace_delete" on public.marketplace_listings
  for delete using (auth.uid() = user_id);

create index if not exists marketplace_listings_created
  on public.marketplace_listings (created_at desc);

-- Install counter without granting update rights on other people's rows.
create or replace function public.marketplace_install(listing_id text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.marketplace_listings
     set installs = installs + 1
   where id = listing_id;
$$;

grant execute on function public.marketplace_install(text) to authenticated;
