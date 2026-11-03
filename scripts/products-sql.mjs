// Prints SQL that creates/updates the saas_products rows for every product in
// site.config.mjs. Paste the output into the Supabase SQL editor.
import site from "../site.config.mjs";
const q = (s) => (s == null ? "null" : `'${String(s).replace(/'/g, "''")}'`);
const rows = site.products.map((p) =>
  `  (${q(p.slug)}, ${q(p.name.replace(/\*/g, ""))}, ${q(p.description)}, ${q(p.status ?? "waitlist_open")})`);
console.log(`insert into public.saas_products (slug, name, description, status) values
${rows.join(",\n")}
on conflict (slug) do update set name = excluded.name, description = excluded.description, status = excluded.status;`);
