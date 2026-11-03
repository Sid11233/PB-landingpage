const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 256-bit random token, URL-safe. */
export function randomToken(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(input)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message))));
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export type UnsubscribeKind = "n" | "w"; // n = newsletter subscriber, w = waitlist registration

/**
 * Stateless signed unsubscribe token: "<kind>.<uuid>.<hmac>". It can be
 * regenerated for every email (no plaintext storage) and cannot be forged
 * without UNSUBSCRIBE_TOKEN_SECRET.
 */
export async function signUnsubscribeToken(secret: string, kind: UnsubscribeKind, id: string): Promise<string> {
  return `${kind}.${id}.${await hmac(secret, `unsubscribe:${kind}:${id}`)}`;
}

export async function verifyUnsubscribeToken(
  secret: string, token: string,
): Promise<{ kind: UnsubscribeKind; id: string } | null> {
  const m = /^([nw])\.([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!m) return null;
  const expected = await signUnsubscribeToken(secret, m[1] as UnsubscribeKind, m[2]);
  return safeEqual(expected, token) ? { kind: m[1] as UnsubscribeKind, id: m[2] } : null;
}
