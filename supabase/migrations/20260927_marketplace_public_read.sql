-- The marketplace is the distribution channel: community listings are
-- readable without an account. Writing still needs one (owner-only).

drop policy if exists "marketplace_select" on public.marketplace_listings;
create policy "marketplace_select" on public.marketplace_listings
  for select to anon, authenticated using (true);

-- Installing a copy doesn't need an account either. The counter is a
-- vanity metric that signed-in users could already bump at will.
grant execute on function public.marketplace_install(text) to anon;
