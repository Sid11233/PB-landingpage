// n8n -> backend callbacks. Header: X-Automation-Secret: <AUTOMATION_CALLBACK_SECRET>
//
// POST { action, ... }
//   event.claim        { event_id }                         -> { proceed, already_sent[] }
//   email.result       { event_id, message_type, status: "smtp_accepted"|"failed",
//                        smtp_message_id?, smtp_response?, error? }
//   email.bounced      { email, reason? }
//   campaign.start     { identifier }                       -> { campaign_id, queued }
//   campaign.next_batch{ campaign_id, limit? }               -> { messages: [...] } (rendered, personalised)
//   campaign.result    { recipient_id, status, smtp_message_id?, error? }
//   campaign.complete  { campaign_id }                      -> { complete, stats }
import { config } from "../_shared/config.ts";
import { safeEqual } from "../_shared/crypto.ts";
import { db, rpc } from "../_shared/db.ts";
import { campaign as renderCampaign } from "../_shared/emails/templates.ts";
import { errorResponse, HttpError, json, readJson } from "../_shared/http.ts";
import { unsubscribeUrl } from "../_shared/outbox.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const uuid = (v: unknown, name: string) => {
  if (typeof v !== "string" || !UUID.test(v)) throw new HttpError(400, `${name} must be a UUID`);
  return v;
};
const str = (v: unknown, max = 2000) => (typeof v === "string" && v ? v.slice(0, max) : null);

Deno.serve(async (req) => {
  try {
    const secret = req.headers.get("x-automation-secret") ?? "";
    if (req.method !== "POST" || !config.callbackSecret || !safeEqual(secret, config.callbackSecret)) {
      throw new HttpError(401, "unauthorised");
    }
    const b = await readJson(req, 64_000);
    switch (b.action) {
      case "event.claim":
        return json(req, 200, await rpc("claim_event_processing", { p_event_id: uuid(b.event_id, "event_id") }));

      case "email.result": {
        const status = b.status === "smtp_accepted" ? "smtp_accepted" : "failed";
        const r = await rpc("record_email_result", {
          p_event_id: uuid(b.event_id, "event_id"),
          p_message_type: str(b.message_type, 80),
          p_status: status,
          p_smtp_message_id: str(b.smtp_message_id, 300),
          p_smtp_response: str(b.smtp_response, 1000),
          p_error: status === "failed" ? (str(b.error) ?? "unknown SMTP error") : null,
        });
        return json(req, 200, r);
      }

      case "email.bounced":
        return json(req, 200, await rpc("mark_email_bounced", { p_email: str(b.email, 254), p_reason: str(b.reason, 500) ?? "bounced" }));

      case "campaign.start":
        return json(req, 200, await rpc("campaign_start", { p_identifier: str(b.identifier, 120) }));

      case "campaign.next_batch": {
        const campaignId = uuid(b.campaign_id, "campaign_id");
        const limit = Math.min(Math.max(Number(b.limit) || 25, 1), 100);
        const { data: c, error } = await db().from("newsletter_campaigns").select("*").eq("id", campaignId).single();
        if (error || !c) throw new HttpError(404, "campaign not found");
        if (c.status !== "sending") return json(req, 200, { messages: [], reason: `campaign is ${c.status}` });
        const rows = await rpc<{ recipient_id: string; subscriber_id: string; email: string; first_name: string | null }[]>(
          "campaign_next_batch", { p_campaign_id: campaignId, p_limit: limit });
        const from = `${config.senderName.replace(/["<>]/g, "")} <${config.senderEmail}>`;
        const messages = await Promise.all((rows ?? []).map(async (r) => ({
          recipient_id: r.recipient_id,
          type: "campaign",
          to: r.email,
          from,
          ...renderCampaign({ siteName: config.siteName, siteUrl: config.siteUrl }, {
            subject: c.subject, preheader: c.preheader, htmlBody: c.html_body, textBody: c.text_body,
            firstName: r.first_name, email: r.email, unsubscribeUrl: await unsubscribeUrl("n", r.subscriber_id),
          }),
        })));
        return json(req, 200, { campaign_id: campaignId, identifier: c.identifier, count: messages.length, messages });
      }

      case "campaign.result":
        await rpc("campaign_record_result", {
          p_recipient_id: uuid(b.recipient_id, "recipient_id"),
          p_status: b.status === "smtp_accepted" ? "smtp_accepted" : "failed",
          p_smtp_message_id: str(b.smtp_message_id, 300),
          p_error: b.status === "smtp_accepted" ? null : (str(b.error) ?? "unknown SMTP error"),
        });
        return json(req, 200, { ok: true });

      case "campaign.complete":
        return json(req, 200, await rpc("campaign_complete", { p_campaign_id: uuid(b.campaign_id, "campaign_id") }));

      default:
        throw new HttpError(400, "unknown action");
    }
  } catch (err) {
    return errorResponse(req, err);
  }
});
