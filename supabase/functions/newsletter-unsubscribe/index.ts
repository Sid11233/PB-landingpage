// POST { token, reason? } — newsletter (n.*) and waiting-list (w.*) unsubscribe.
// Also accepts the token as ?token=... for RFC 8058 one-click (List-Unsubscribe-Post).
import { config, missing } from "../_shared/config.ts";
import { verifyUnsubscribeToken } from "../_shared/crypto.ts";
import { rpc } from "../_shared/db.ts";
import { rateLimit, requireConfigured } from "../_shared/guard.ts";
import { background, json, publicEndpoint } from "../_shared/http.ts";
import { dispatchNow } from "../_shared/outbox.ts";
import { cleanText } from "../_shared/validate.ts";

Deno.serve(publicEndpoint(async (req, body) => {
  requireConfigured(missing("serviceRoleKey", "tokenSecret"));
  await rateLimit(req, "unsubscribe", 30, 600);
  const raw = typeof body.token === "string" ? body.token : new URL(req.url).searchParams.get("token") ?? "";
  const t = await verifyUnsubscribeToken(config.tokenSecret, raw.trim());
  if (!t) return json(req, 200, { ok: false, result: "invalid", error: "This unsubscribe link isn't valid. Please use the link from your most recent email." });

  const reason = cleanText(body.reason, 500) || null;
  const r = t.kind === "n"
    ? await rpc<{ result: string; event_id?: string }>("newsletter_unsubscribe", { p_subscriber_id: t.id, p_reason: reason })
    : await rpc<{ result: string }>("waitlist_leave", { p_registration_id: t.id });
  if ("event_id" in r && r.event_id) await background(dispatchNow(r.event_id));

  // not_found = the record was deleted (e.g. a data-deletion request): nothing left to unsubscribe.
  const list = t.kind === "n" ? "the newsletter" : "this waiting list";
  return json(req, 200, {
    ok: true, result: r.result, kind: t.kind === "n" ? "newsletter" : "waitlist",
    message: r.result === "already_unsubscribed" || r.result === "not_found"
      ? `You're already unsubscribed from ${list}.`
      : `You've been unsubscribed from ${list}. You won't receive further emails from it.`,
  });
}));
