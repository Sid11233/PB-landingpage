// Renders the social-share image and icons with the site's own fonts.
// Re-run after changing the headline or name:  node scripts/render-images.mjs
// (needs the dev dependency `playwright` + `npx playwright install chromium`)
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import site from "../site.config.mjs";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));
const OUT = SRC + "static/";
mkdirSync(OUT, { recursive: true });
const font = (f) => `data:font/woff2;base64,${readFileSync(SRC + "assets/fonts/" + f).toString("base64")}`;
const css = `
@font-face{font-family:'Inter Tight';font-weight:400 700;src:url(${font("inter-tight-latin.woff2")})}
@font-face{font-family:'Instrument Serif';font-style:italic;src:url(${font("instrument-serif-italic-latin.woff2")})}
*{margin:0;box-sizing:border-box}body{background:#161615;color:#F1ECE2;font-family:'Inter Tight';-webkit-font-smoothing:antialiased}
.it{font-family:'Instrument Serif';font-style:italic;font-weight:400;text-transform:none;letter-spacing:-.02em;color:${site.accent}}`;

const og = `<style>${css}
.og{width:1200px;height:630px;padding:56px 72px;display:flex;flex-direction:column;justify-content:space-between}
.top{display:flex;justify-content:space-between;align-items:center}
.name{font-weight:700;font-size:34px;letter-spacing:-.025em}
.eb{font-size:16px;letter-spacing:.14em;text-transform:uppercase;color:#A8A59D}
h1{font-weight:700;text-transform:uppercase;letter-spacing:-.045em;line-height:.9;font-size:96px}
.rule{border-top:1px solid #36352F;padding-top:22px;display:flex;justify-content:space-between}</style>
<div class="og"><div class="top"><span class="name">${site.name}</span><span class="eb">${site.location}</span></div>
<h1>AI, automation<br>&amp; marketing<br><span class="it">that grow your business.</span></h1>
<div class="rule eb"><span>AI &amp; automation · Growth marketing</span><span>Work with me ↗</span></div></div>`;

const icon = (size) => `<style>${css}
.ic{width:${size}px;height:${size}px;background:#161615;display:flex;align-items:center;justify-content:center;border-radius:${size * 0.22}px}
.ic span{font-size:${size * 0.62}px;line-height:1;letter-spacing:-.06em}
b{font-weight:700}</style>
<div class="ic"><span><b>S</b><span class="it" style="font-size:inherit">j</span></span></div>`;

const browser = await chromium.launch();
const shot = async (html, w, h, file, transparent = false) => {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  if (transparent) await page.addStyleTag({ content: "body{background:transparent}" });
  const buf = await page.screenshot({ omitBackground: transparent });
  writeFileSync(OUT + file, buf);
  await page.close();
  return buf;
};
await shot(og, 1200, 630, "og-image.png");
await shot(icon(180), 180, 180, "apple-touch-icon.png");
await shot(icon(192), 192, 192, "icon-192.png");
await shot(icon(512), 512, 512, "icon-512.png");
const png32 = await shot(icon(32), 32, 32, "favicon-32.png", true);
// favicon.ico = ICO container holding the 32px PNG
const ico = Buffer.alloc(22);
ico.writeUInt16LE(0, 0); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4);
ico.writeUInt8(32, 6); ico.writeUInt8(32, 7); ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(png32.length, 14); ico.writeUInt32LE(22, 18);
writeFileSync(OUT + "favicon.ico", Buffer.concat([ico, png32]));
await browser.close();
console.log("Images written to src/static/");
