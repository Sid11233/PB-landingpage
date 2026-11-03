import { config } from "./config.ts";
import { sha256Hex } from "./crypto.ts";
import { rpc } from "./db.ts";
import { HttpError } from "./http.ts";

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "unknown";
}

/** Fixed-window rate limit per (route, salted IP hash). Raw IPs are never stored. */
export async function rateLimit(req: Request, route: string, limit: number, windowSeconds: number) {
  const key = `${route}:${(await sha256Hex(`${config.rateLimitSalt}:${clientIp(req)}`)).slice(0, 32)}`;
  const allowed = await rpc<boolean>("check_rate_limit", {
    p_key: key, p_limit: limit, p_window_seconds: windowSeconds,
  });
  if (!allowed) throw new HttpError(429, "Too many attempts. Please wait a few minutes and try again.");
}

/**
 * Bot checks. The hidden "website" field is invisible to people but bots fill it.
 * "elapsed_ms" is how long the form was open; instant submissions are scripted.
 * Returns true when the request should be silently dropped.
 */
export function looksLikeBot(body: Record<string, unknown>, minMs: number): boolean {
  if (typeof body.website === "string" && body.website.trim() !== "") return true;
  const elapsed = Number(body.elapsed_ms);
  if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < minMs) return true;
  return false;
}

export function requireConfigured(keys: string[]) {
  if (keys.length) {
    console.error("Missing configuration:", keys.join(", "));
    throw new HttpError(503, "This form isn't available yet. Please try again later.");
  }
}
