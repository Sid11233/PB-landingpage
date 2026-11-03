// POST { product_slug, first_name, email, company_name?, additional_info?, website, elapsed_ms }
// Joining a waiting list never subscribes anyone to the newsletter.
import { missing } from "../_shared/config.ts";
import { rpc } from "../_shared/db.ts";
import { looksLikeBot, rateLimit, requireConfigured } from "../_shared/guard.ts";
import { background, HttpError, json, publicEndpoint } from "../_shared/http.ts";
import { dispatchNow } from "../_shared/outbox.ts";
import { cleanText, Validator } from "../_shared/validate.ts";

const SUCCESS = { ok: true, status: "joined", message: "You're on the list. I'll write when there's something to try." };

Deno.serve(publicEndpoint(async (req, body) => {
  requireConfigured(missing("serviceRoleKey"));
  if (looksLikeBot(body, 1500)) return json(req, 200, SUCCESS);

  const v = new Validator();
  const slug = cleanText(body.product_slug, 80);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw new HttpError(400, "Unknown product.");
  const firstName = v.require("first_name", cleanText(body.first_name, 80), "First name", 80);
  const email = v.email("email", body.email);
  const company = v.optional("company_name", cleanText(body.company_name, 160), "Company name", 160);
  const info = v.optional("additional_info", cleanText(body.additional_info, 2000, true), "Additional information", 2000);
  v.done();

  await rateLimit(req, "waitlist", 6, 600);
  const r = await rpc<{ action: string; event_id?: string }>("waitlist_register", {
    p_product_slug: slug, p_first_name: firstName, p_email: email,
    p_company_name: company, p_additional_info: info, p_source: "website",
  });
  if (r.action === "product_unavailable") throw new HttpError(409, "This waiting list isn't open right now.");
  if (r.event_id) await background(dispatchNow(r.event_id));
  // A duplicate gets the same answer (and no second email).
  return json(req, 200, SUCCESS);
}));
