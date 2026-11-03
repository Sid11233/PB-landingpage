// Minimal static server for local preview of dist/ (clean URLs + 404 page).
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = fileURLToPath(new URL("../dist/", import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2", ".xml": "application/xml",
  ".txt": "text/plain", ".vcf": "text/vcard", ".webmanifest": "application/manifest+json" };

createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  let file = join(DIST, path);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  const found = existsSync(file) && file.startsWith(DIST);
  const target = found ? file : join(DIST, "404.html");
  res.writeHead(found ? 200 : 404, { "Content-Type": TYPES[extname(target)] || "application/octet-stream", "Cache-Control": "no-cache" });
  res.end(readFileSync(target));
}).listen(PORT, () => console.log(`Serving dist/ on http://localhost:${PORT}`));
