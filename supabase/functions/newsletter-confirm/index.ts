// POST { token } — called by /newsletter/confirm/ (the email link opens that page;
// the page POSTs here, so link-scanners that only GET cannot confirm on someone's behalf).
import { missing } from "../_shared/config.ts";
import { sha256Hex } from "../_shared/crypto.ts";
import { rpc } from "../_shared/db.ts";
import { rateLimit, requireConfigured } from "../_shared/guard.ts";
import { background, json, publicEndpoint } from "../_shared/http.ts";
import { dispatchNow } from "../_shared/outbox.ts";

const MESSAGES: Record<string, string> = {
  confirmed: "You're subscribed. A welcome email is on its way.",
  already_confirmed: "You've already confirmed. You're subscribed.",
  expired: "This confirmation link has expired. Please subscribe again to get a new one.",
  invalid: "This confirmation link isn't valid or has already been used.",
};

Deno.serve(publicEndpoint(async (req, body) => {
  requireConfigured(missing("serviceRoleKey"));
  await rateLimit(req, "confirm", 30, 600);
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return json(req, 200, { ok: false, result: "invalid", error: MESSAGES.invalid });
  }
  const r = await rpc<{ result: string; event_id?: string }>("newsletter_confirm", { p_token_hash: await sha256Hex(token) });
  if (r.event_id) await background(dispatchNow(r.event_id));
  const ok = r.result === "confirmed" || r.result === "already_confirmed";
  // Expected outcomes (expired/invalid) are 200 + ok:false, not HTTP errors.
  return json(req, 200, { ok, result: r.result, [ok ? "message" : "error"]: MESSAGES[r.result] ?? MESSAGES.invalid });
}));
