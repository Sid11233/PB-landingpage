// POST { full_name, email, category, subject, message, website, elapsed_ms }
import { missing } from "../_shared/config.ts";
import { rpc } from "../_shared/db.ts";
import { looksLikeBot, rateLimit, requireConfigured } from "../_shared/guard.ts";
import { background, json, publicEndpoint } from "../_shared/http.ts";
import { dispatchNow } from "../_shared/outbox.ts";
import { cleanText, Validator } from "../_shared/validate.ts";

const CATEGORIES = ["business", "collaboration", "saas", "technology", "general", "other"];
const SUCCESS = { ok: true, status: "received", message: "Thanks, your message has been received. I'll get back to you as soon as possible." };

Deno.serve(publicEndpoint(async (req, body) => {
  requireConfigured(missing("serviceRoleKey"));
  if (looksLikeBot(body, 3000)) return json(req, 200, SUCCESS);

  const v = new Validator();
  const fullName = v.require("full_name", cleanText(body.full_name, 120), "Full name", 120);
  const email = v.email("email", body.email);
  const category = cleanText(body.category, 40);
  if (!CATEGORIES.includes(category)) v.fail("category", "Please choose what your enquiry is about.");
  const subject = v.require("subject", cleanText(body.subject, 200), "Subject", 200);
  const message = v.require("message", cleanText(body.message, 5000, true), "Message", 5000);
  if (message && message !== "\u0000TOO_LONG" && message.length < 10) v.fail("message", "Please write a little more so I can help.");
  v.done();

  await rateLimit(req, "contact", 4, 600);
  await rateLimit(req, "contact-day", 15, 86_400);
  const r = await rpc<{ event_id: string }>("contact_submit", {
    p_full_name: fullName, p_email: email, p_category: category, p_subject: subject, p_message: message,
  });
  await background(dispatchNow(r.event_id));
  return json(req, 200, SUCCESS);
}));
