// Shared HTML partials. Markup and inline styles are taken verbatim from the
// original design export; only links/attributes are wired to site.config.mjs.

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** "[Product *name*]" -> "[Product <em>name</em>]" (escaped). */
export const emphasise = (s) => esc(s).replace(/\*(.+?)\*/g, "<em>$1</em>");
export const plain = (s) => String(s ?? "").replace(/\*/g, "");

const SERIF = "font-family: 'Instrument Serif', Georgia, serif";
export const WRAP = "max-width: 1360px; margin: 0 auto; box-sizing: border-box";

/** Attributes for external links. */
export const ext = (url) => (/^https?:\/\//.test(url) ? ` target="_blank" rel="noopener noreferrer"` : "");

// ---------------------------------------------------------------------------
// <head>
// ---------------------------------------------------------------------------
export function head(site, { title, description, path = "/", noindex = false, jsonLd = null, assets }) {
  const url = site.url + path;
  const t = title ? `${title} · ${site.name}` : site.title;
  const d = description ?? site.description;
  const a = site.analytics;
  const analyticsTag = a.provider && a.scriptUrl
    ? a.provider === "plausible"
      ? `<script defer data-domain="${esc(a.siteId)}" src="${esc(a.scriptUrl)}"></script>`
      : `<script defer data-website-id="${esc(a.siteId)}" data-auto-track="true" src="${esc(a.scriptUrl)}"></script>`
    : "";
  return `<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t)}</title>
<meta name="description" content="${esc(d)}">
<link rel="canonical" href="${esc(url)}">
${noindex ? `<meta name="robots" content="noindex, nofollow">` : `<meta name="robots" content="index, follow">`}
<meta name="theme-color" content="#161615">
<meta name="color-scheme" content="dark light">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:title" content="${esc(t)}">
<meta property="og:description" content="${esc(d)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(site.url)}/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(site.name)}: AI, automation &amp; marketing that grow your business.">
<meta property="og:locale" content="en_GB">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(t)}">
<meta name="twitter:description" content="${esc(d)}">
<meta name="twitter:image" content="${esc(site.url)}/og-image.png">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="preload" href="/assets/fonts/inter-tight-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/instrument-serif-italic-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${assets.css}">
<script src="${assets.config}" defer></script>
<script src="${assets.js}" defer></script>
${analyticsTag}
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>` : ""}
</head>`;
}

// ---------------------------------------------------------------------------
// Nav (verbatim from the design; on sub-pages the anchors point back home)
// ---------------------------------------------------------------------------
export function nav(site, { home = true } = {}) {
  const h = home ? "" : "/";
  return `<nav aria-label="Main" style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 24px; padding: 20px 0">
<a href="${home ? "#top" : "/"}" style="font-weight: 700; font-size: clamp(24px, 2.4vw, 32px); letter-spacing: -0.025em; line-height: 1; min-height: 44px; display: flex; align-items: center">${esc(site.name)}</a>
<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 0 28px; font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase">
<a class="navlink navtext" href="${h}#services" style="min-height: 44px; display: flex; align-items: center">Services</a>
<a class="navlink navtext" href="${h}#waitlist" style="min-height: 44px; display: flex; align-items: center">Waitlist</a>
<a class="btn sweep sweep-solid" href="${h}#contact" data-track="cta_click" data-track-label="nav_work_with_me" style="height: 44px; box-sizing: border-box; padding: 0 22px; border-radius: 999px; background: ${site.accent}; color: #161615; display: flex; align-items: center; font-weight: 600">Work with me</a>
</div>
</nav>`;
}

// ---------------------------------------------------------------------------
// Social links: icons from the design (+ GitHub / YouTube in the same line style)
// ---------------------------------------------------------------------------
const ICON = (inner) => `<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
export const SOCIALS = [
  { key: "instagram", label: "Instagram", icon: ICON(`<rect x="3" y="3" width="18" height="18" rx="5"></rect><circle cx="12" cy="12" r="4"></circle><circle cx="17.5" cy="6.5" r="0.8" fill="currentColor"></circle>`) },
  { key: "linkedin", label: "LinkedIn", icon: ICON(`<rect x="3" y="3" width="18" height="18" rx="3"></rect><path d="M8 11v5M8 8v.01M12 16v-5M12 13c0-1.5 1-2 2-2s2 .8 2 2.2V16"></path>`) },
  { key: "tiktok", label: "TikTok", icon: ICON(`<path d="M14 3v11a3.5 3.5 0 1 1-3.5-3.5M14 3c.4 2.4 2 4 4.5 4.2"></path>`) },
  { key: "x", label: "X", icon: ICON(`<path d="M4 4l16 16M20 4L4 20"></path>`) },
  { key: "github", label: "GitHub", icon: ICON(`<path d="M9 19c-4 1.3-4-2-6-2.5M15 21v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.3 4.3 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"></path>`) },
  { key: "youtube", label: "YouTube", icon: ICON(`<rect x="2.5" y="5" width="19" height="14" rx="4"></rect><path d="M10 9.5v5l4.5-2.5z"></path>`) },
];

export function socialLinks(site) {
  const items = SOCIALS.filter((s) => site.social[s.key]);
  if (!items.length) return "";
  return `<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 28px 0 40px 0; border-top: 1px solid #36352F">
<span style="font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: #A8A59D; margin-right: 8px">Follow along</span>
${items.map((s) => `<a class="social" href="${esc(site.social[s.key])}"${ext(site.social[s.key])} aria-label="${esc(s.label)} (opens in a new tab)" data-track="social_click" data-track-label="${s.key}" style="height: 52px; box-sizing: border-box; padding: 0 22px 0 18px; border-radius: 999px; border: 1px solid #8A877F; display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 15px">${s.icon}${esc(s.label)}</a>`).join("\n")}
</div>`;
}

// ---------------------------------------------------------------------------
// Footer bar (verbatim + legal links)
// ---------------------------------------------------------------------------
export function footerBar(site) {
  return `<div style="display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px 24px; margin-top: 72px; padding-top: 24px; border-top: 1px solid #36352F; font-size: 13px; color: #A8A59D">
<span>© ${new Date().getFullYear()} ${esc(site.name)}</span>
<span class="foot-links"><a href="${site.legal.privacyUrl}">Privacy</a><a href="${site.legal.termsUrl}">Terms</a><span>${esc(site.location)}</span></span>
</div>`;
}

/** Small dark page shell used by sub-pages (confirm, unsubscribe, 404). */
export function darkShell(site, inner) {
  return `<section id="top" style="background: #161615; color: #F1ECE2">
<div style="${WRAP}; padding: 0 clamp(20px, 4vw, 48px) 32px clamp(20px, 4vw, 48px)">
${nav(site, { home: false })}
<main id="main">
${inner}
</main>
${footerBar(site)}
</div>
</section>`;
}

/** Big two-tone heading in the "Let's talk." style. */
export function bigHeading(tag, first, italic, site, extra = "") {
  return `<${tag} ${extra} style="margin: 0; font-weight: 700; text-transform: uppercase; letter-spacing: -0.045em; line-height: 0.86; font-size: clamp(56px, 11vw, 160px)">${esc(first)}<br><span style="${SERIF}; font-style: italic; font-weight: 400; text-transform: none; letter-spacing: -0.02em; color: ${site.accent}">${esc(italic)}</span></${tag}>`;
}

export function page(site, headHtml, bodyHtml) {
  return `<!doctype html>
<html lang="${site.locale}">
${headHtml}
<body>
<a class="skip-link" href="#main">Skip to content</a>
<div class="page" style="--accent: ${site.accent}; background: #161615; color: #F1ECE2; font-family: 'Inter Tight', system-ui, sans-serif; font-size: 16px; line-height: 1.5; -webkit-font-smoothing: antialiased; overflow: hidden">
${bodyHtml}
</div>
</body>
</html>
`;
}
