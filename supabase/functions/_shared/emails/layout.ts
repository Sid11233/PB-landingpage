// Responsive, table-based HTML email layout in the site's palette:
// charcoal #161615, cream #F1ECE2, navy #1B2A41, steel blue #A9BBD6.
// Web fonts are unreliable in email clients, so Georgia stands in for
// Instrument Serif and the system sans stack for Inter Tight.

export const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const SERIF = "'Instrument Serif',Georgia,'Times New Roman',serif";

export interface LayoutOptions {
  siteName: string;
  siteUrl: string;
  preheader?: string;
  /** Large serif heading. May contain one *italic* segment. */
  heading: string;
  bodyHtml: string;
  /** Footer line explaining why the person received the email. */
  reason: string;
  unsubscribeUrl?: string;
  unsubscribeLabel?: string;
}

function headingHtml(h: string): string {
  return esc(h).replace(/\*(.+?)\*/g, `<em style="font-style:italic;color:#1B2A41">$1</em>`);
}

export function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 8px 0"><tr><td style="border-radius:999px;background:#1B2A41">
<a href="${esc(href)}" target="_blank" style="display:inline-block;padding:16px 30px;font-family:${SANS};font-size:16px;font-weight:600;color:#F1ECE2;text-decoration:none;border-radius:999px">${esc(label)}</a>
</td></tr></table>`;
}

export const p = (html: string) =>
  `<p style="margin:0 0 16px 0;font-family:${SANS};font-size:16px;line-height:1.6;color:#1D1D1B">${html}</p>`;

export const small = (html: string) =>
  `<p style="margin:0 0 12px 0;font-family:${SANS};font-size:13px;line-height:1.55;color:#66645F">${html}</p>`;

/** Two-column key/value table for internal notifications. */
export function fieldTable(rows: [string, string][]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0;border-top:1px solid #D6CFC0">
${rows.map(([k, v]) => `<tr><td style="padding:10px 12px 10px 0;border-bottom:1px solid #D6CFC0;font-family:${SANS};font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#66645F;vertical-align:top;width:150px">${esc(k)}</td>
<td style="padding:10px 0;border-bottom:1px solid #D6CFC0;font-family:${SANS};font-size:15px;line-height:1.5;color:#1D1D1B;white-space:pre-wrap;word-break:break-word">${esc(v) || "&mdash;"}</td></tr>`).join("\n")}
</table>`;
}

export function layout(o: LayoutOptions): string {
  const pre = o.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${esc(o.preheader)}&#8202;&zwnj;&nbsp;&#8202;&zwnj;&nbsp;&#8202;&zwnj;&nbsp;</div>`
    : "";
  const unsub = o.unsubscribeUrl
    ? `<br><a href="${esc(o.unsubscribeUrl)}" target="_blank" style="color:#A8A59D;text-decoration:underline">${esc(o.unsubscribeLabel ?? "Unsubscribe")}</a>`
    : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">
<title>${esc(o.siteName)}</title>
<style>@media (max-width:620px){.px{padding-left:24px!important;padding-right:24px!important}.h1{font-size:36px!important}}</style>
</head>
<body style="margin:0;padding:0;background:#161615;-webkit-text-size-adjust:100%">
${pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#161615">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">
<tr><td class="px" style="padding:20px 40px 24px 40px">
<a href="${esc(o.siteUrl)}" target="_blank" style="font-family:${SANS};font-size:22px;font-weight:700;letter-spacing:-.02em;color:#F1ECE2;text-decoration:none">${esc(o.siteName)}</a>
</td></tr>
<tr><td class="px" style="background:#F1ECE2;border-radius:14px;padding:40px 40px 32px 40px">
<h1 class="h1" style="margin:0 0 24px 0;font-family:${SERIF};font-weight:400;font-size:44px;line-height:1.02;letter-spacing:-.01em;color:#1D1D1B">${headingHtml(o.heading)}</h1>
${o.bodyHtml}
</td></tr>
<tr><td class="px" style="padding:24px 40px;font-family:${SANS};font-size:12px;line-height:1.6;color:#A8A59D">
${esc(o.reason)}${unsub}
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

/** Plain-text counterpart with the same structure. */
export function textLayout(o: { siteName: string; heading: string; body: string; reason: string; unsubscribeUrl?: string }): string {
  return [
    o.siteName.toUpperCase(),
    "",
    o.heading.replace(/\*/g, ""),
    "",
    o.body.trim(),
    "",
    "—",
    o.reason,
    o.unsubscribeUrl ? `Unsubscribe: ${o.unsubscribeUrl}` : "",
  ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n").trim() + "\n";
}
