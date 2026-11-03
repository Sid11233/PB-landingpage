-- Local development seed (run automatically by `supabase db reset`).
-- In production, generate the product upsert from site.config.mjs with:
--   npm run products:sql
insert into public.saas_products (slug, name, description, status) values
  ('first-product', '[Product name]', '[One sentence on what it does and who it is for.]', 'waitlist_open')
on conflict (slug) do update set name = excluded.name, description = excluded.description, status = excluded.status;
