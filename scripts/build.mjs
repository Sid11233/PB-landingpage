// Builds the static site into dist/. No dependencies: `node scripts/build.mjs`.
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import site from "../site.config.mjs";
import renderIndex from "../src/pages/index.mjs";
import { confirmPage, notFoundPage, privacyPage, termsPage, unsubscribePage, waitlistPage } from "../src/pages/secondary.mjs";
import { plain, SOCIALS } from "../src/partials.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(root, "src");
const OUT = join(root, "dist");

site.url = site.url.replace(/\/+$/, "");
site.apiBaseUrl = site.apiBaseUrl.replace(/\/+$/, "");

// ---- sanity checks -----------------------------------------------------------
const warnings = [];
if (/localhost|127\.0\.0\.1|example\.com/.test(site.url)) warnings.push(`SITE_URL is "${site.url}". Set your real domain before deploying.`);
if (!site.apiBaseUrl) warnings.push("PUBLIC_API_BASE_URL is empty. The forms will show 'not connected yet' until it is set.");
if (!site.contact.email) warnings.push("CONTACT_EMAIL is empty. The email button is replaced by a link to the contact form.");
const noSocials = SOCIALS.filter((s) => !site.social[s.key]).map((s) => s.label);
if (noSocials.length) warnings.push(`Hidden (not configured) social links: ${noSocials.join(", ")}.`);
const slugs = new Set();
for (const p of site.products) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.slug)) throw new Error(`Invalid product slug "${p.slug}"`);
  if (slugs.has(p.slug)) throw new Error(`Duplicate product slug "${p.slug}"`);
  slugs.add(p.slug);
  if (/\[.*\]/.test(p.name)) warnings.push(`Product "${p.slug}" still has placeholder text: ${p.name}`);
}

// ---- assets -----------------------------------------------------------------
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(join(SRC, "assets"), join(OUT, "assets"), { recursive: true });
if (existsSync(join(SRC, "static"))) cpSync(join(SRC, "static"), OUT, { recursive: true });

const hash = (s) => createHash("sha256").update(s).digest("hex").slice(0, 10);
function fingerprint(rel, content) {
  const name = rel.replace(/(\.\w+)$/, `.${hash(content)}$1`);
  writeFileSync(join(OUT, name), content);
  if (name !== rel) rmSync(join(OUT, rel), { force: true });
  return "/" + name;
}
const publicConfig = {
  apiBaseUrl: site.apiBaseUrl,
  siteUrl: site.url,
  analytics: { provider: site.analytics.provider || "" },
};
const configJs = `window.SITE_CONFIG = ${JSON.stringify(publicConfig)};\n`;
writeFileSync(join(OUT, "assets/js/config.js"), configJs);
const assets = {
  css: fingerprint("assets/css/site.css", readFileSync(join(SRC, "assets/css/site.css"))),
  js: fingerprint("assets/js/site.js", readFileSync(join(SRC, "assets/js/site.js"))),
  config: fingerprint("assets/js/config.js", configJs),
  vcard: `${site.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.vcf`,
};

// ---- pages --------------------------------------------------------------------
const pages = {
  "index.html": renderIndex(site, assets),
  "newsletter/confirm/index.html": confirmPage(site, assets),
  "newsletter/unsubscribe/index.html": unsubscribePage(site, assets),
  "privacy/index.html": privacyPage(site, assets),
  "terms/index.html": termsPage(site, assets),
  "404.html": notFoundPage(site, assets),
};
for (const p of site.products) pages[`waitlist/${p.slug}/index.html`] = waitlistPage(site, p, assets);
for (const [path, html] of Object.entries(pages)) {
  mkdirSync(dirname(join(OUT, path)), { recursive: true });
  writeFileSync(join(OUT, path), html);
}

// ---- SEO files ------------------------------------------------------------------
const today = new Date().toISOString().slice(0, 10);
const indexable = ["/", ...site.products.map((p) => `/waitlist/${p.slug}/`), "/privacy/", "/terms/"];
writeFileSync(join(OUT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${indexable.map((u) => `  <url><loc>${site.url}${u}</loc><lastmod>${today}</lastmod></url>`).join("\n")}
</urlset>
`);
writeFileSync(join(OUT, "robots.txt"), `User-agent: *
Allow: /
Disallow: /newsletter/

Sitemap: ${site.url}/sitemap.xml
`);
writeFileSync(join(OUT, "site.webmanifest"), JSON.stringify({
  name: site.name, short_name: site.name, start_url: "/", display: "browser",
  background_color: "#161615", theme_color: "#161615",
  icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png" }],
}, null, 2));

// ---- vCard ("Save contact") ---------------------------------------------------------
const vEsc = (s) => String(s).replace(/([,;\\])/g, "\\$1");
const [first, ...rest] = site.name.split(" ");
writeFileSync(join(OUT, assets.vcard), [
  "BEGIN:VCARD", "VERSION:3.0",
  `N:${vEsc(rest.join(" "))};${vEsc(first)};;;`, `FN:${vEsc(site.name)}`,
  site.contact.email && `EMAIL;TYPE=INTERNET:${site.contact.email}`,
  site.contact.phone && `TEL;TYPE=CELL:${site.contact.phone}`,
  `URL:${site.url}`,
  ...SOCIALS.filter((s) => site.social[s.key]).map((s) => `X-SOCIALPROFILE;TYPE=${s.key}:${site.social[s.key]}`),
  `ADR;TYPE=WORK:;;;;;;${vEsc(site.location)}`,
  "END:VCARD", "",
].filter(Boolean).join("\r\n"));

// ---- security & caching headers ------------------------------------------------------
const origin = (u) => { try { return new URL(u).origin; } catch { return ""; } };
const apiOrigin = origin(site.apiBaseUrl);
const analyticsOrigin = site.analytics.provider ? origin(site.analytics.scriptUrl) : "";
const csp = [
  "default-src 'self'",
  `script-src 'self'${analyticsOrigin ? " " + analyticsOrigin : ""}`,
  "style-src 'self' 'unsafe-inline'", // the design uses inline style attributes
  "font-src 'self'",
  "img-src 'self' data:",
  `connect-src 'self'${apiOrigin ? " " + apiOrigin : ""}${analyticsOrigin ? " " + analyticsOrigin : ""}`,
  "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'", "upgrade-insecure-requests",
].join("; ");
const headers = {
  "Content-Security-Policy": csp,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Frame-Options": "DENY",
};
// Netlify / Cloudflare Pages
writeFileSync(join(OUT, "_headers"), `/*
${Object.entries(headers).map(([k, v]) => `  ${k}: ${v}`).join("\n")}

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/newsletter/*
  Cache-Control: no-store
  X-Robots-Tag: noindex
`);
// Apache (e.g. Hostinger web hosting)
writeFileSync(join(OUT, ".htaccess"), `# Generated by scripts/build.mjs
ErrorDocument 404 /404.html
<IfModule mod_headers.c>
${Object.entries(headers).map(([k, v]) => `  Header always set ${k} "${v.replace(/"/g, '\\"')}"`).join("\n")}
  <FilesMatch "\\.(css|js|woff2|png|svg|ico)$">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
</IfModule>
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteCond %{HTTPS} off
  RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
</IfModule>
AddType text/vcard .vcf
`);

console.log(`Built ${Object.keys(pages).length} pages into dist/ for ${site.url}`);
for (const p of site.products) console.log(`  waitlist: /waitlist/${p.slug}/  (${plain(p.name)})`);
if (warnings.length) console.log("\nConfiguration notes:\n" + warnings.map((w) => `  • ${w}`).join("\n"));
