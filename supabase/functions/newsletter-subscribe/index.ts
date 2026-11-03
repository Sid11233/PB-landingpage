// POST { email, first_name?, consent: true, source?, website (honeypot), elapsed_ms }
import { missing } from "../_shared/config.ts";
import { rpc } from "../_shared/db.ts";
import { looksLikeBot, rateLimit, requireConfigured } from "../_shared/guard.ts";
import { background, json, publicEndpoint } from "../_shared/http.ts";
import { dispatchNow } from "../_shared/outbox.ts";
import { cleanText, Validator } from "../_shared/validate.ts";

/** Stored with every subscription as the consent record. Keep in sync with the form text. */
export const NEWSLETTER_CONSENT_TEXT =
  "I agree to receive the newsletter by email. I can unsubscribe at any time using the link in every email. See the privacy policy for how my data is used.";

const SUCCESS = {
  ok: true,
  status: "check_inbox",
  message: "Almost there. Check your inbox and click the link to confirm. If you're already subscribed, there's nothing more to do.",
};

Deno.serve(publicEndpoint(async (req, body) => {
  requireConfigured(missing("serviceRoleKey", "siteUrl"));
  if (looksLikeBot(body, 1200)) return json(req, 200, SUCCESS);

  const v = new Validator();
  const email = v.email("email", body.email);
  const firstName = v.optional("first_name", cleanText(body.first_name, 80), "First name", 80);
  if (body.consent !== true) v.fail("consent", "Please tick the box to confirm you'd like to receive the newsletter.");
  v.done();

  await rateLimit(req, "newsletter", 6, 600);
  const source = cleanText(body.source, 40).replace(/[^a-z0-9_-]/gi, "") || "website";

  const r = await rpc<{ action: string; event_id?: string }>("newsletter_subscribe", {
    p_email: email, p_first_name: firstName, p_source: source, p_consent_text: NEWSLETTER_CONSENT_TEXT,
  });
  if (r.event_id) await background(dispatchNow(r.event_id));
  // Identical response for new, pending, active and suppressed addresses, so the
  // form can't be used to discover who is subscribed.
  return json(req, 200, SUCCESS);
}));
