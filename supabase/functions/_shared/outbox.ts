// Transactional outbox dispatcher.
//
//   form submit ──► SQL function writes record + automation_events row (one transaction)
//               └─► dispatchNow(event_id)  (best effort, after the HTTP response)
//   pg_cron ─────► automation-dispatch every minute: retries due/failed/stuck events
//
// For each event we build the email messages from CURRENT database state, so
// e.g. a welcome email is skipped if the person unsubscribed in the meantime.
// Confirmation tokens are generated here, at send time; only their hash is stored.

import { config, webhookUrlFor } from "./config.ts";
import { randomToken, sha256Hex, signUnsubscribeToken } from "./crypto.ts";
import { db, rpc } from "./db.ts";
import * as T from "./emails/templates.ts";

export interface AutomationEvent {
  id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string | null;
  idempotency_key: string;
  payload: Record<string, unknown>;
  attempts: number;
  created_at: string;
}

export interface OutboundMessage {
  type: string; // e.g. "contact_notification" — unique per event
  to: string;
  from: string;
  reply_to?: string;
  subject: string;
  html: string;
  text: string;
}

type Built = { skip: string } | { messages: OutboundMessage[]; data: Record<string, unknown> };

const brand = (): T.Brand => ({ siteName: config.siteName, siteUrl: config.siteUrl });
const fromHeader = () => `${config.senderName.replace(/["<>]/g, "")} <${config.senderEmail}>`;

export async function unsubscribeUrl(kind: "n" | "w", id: string): Promise<string> {
  const token = await signUnsubscribeToken(config.tokenSecret, kind, id);
  return `${config.siteUrl}/newsletter/unsubscribe/?token=${encodeURIComponent(token)}`;
}

async function one<T>(table: string, id: string | null, columns = "*"): Promise<T | null> {
  if (!id) return null;
  const { data, error } = await db().from(table).select(columns).eq("id", id).maybeSingle();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data as T | null;
}

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

async function build(e: AutomationEvent): Promise<Built> {
  const from = fromHeader();
  switch (e.event_type) {
    case "newsletter.confirmation_requested": {
      const s = await one<Row>("newsletter_subscribers", e.aggregate_id);
      if (!s) return { skip: "subscriber deleted" };
      if (s.status !== "pending") return { skip: `subscriber is ${s.status}` };
      const token = randomToken();
      const { error } = await db().from("newsletter_tokens").insert({
        subscriber_id: s.id, purpose: "confirm", token_hash: await sha256Hex(token),
        expires_at: new Date(Date.now() + config.confirmTokenTtlHours * 3600_000).toISOString(),
      });
      if (error) throw new Error(`newsletter_tokens: ${error.message}`);
      const confirmUrl = `${config.siteUrl}/newsletter/confirm/?token=${encodeURIComponent(token)}`;
      const m = T.newsletterConfirmation(brand(), { firstName: s.first_name, confirmUrl, ttlHours: config.confirmTokenTtlHours });
      return { messages: [{ type: "newsletter_confirmation", to: s.email, from, ...m }], data: { subscriber_id: s.id } };
    }
    case "newsletter.confirmed": {
      const s = await one<Row>("newsletter_subscribers", e.aggregate_id);
      if (!s) return { skip: "subscriber deleted" };
      if (s.status !== "active") return { skip: `subscriber is ${s.status}` };
      const m = T.newsletterWelcome(brand(), { firstName: s.first_name, unsubscribeUrl: await unsubscribeUrl("n", s.id) });
      return { messages: [{ type: "newsletter_welcome", to: s.email, from, ...m }], data: { subscriber_id: s.id } };
    }
    case "newsletter.unsubscribed": {
      const s = await one<Row>("newsletter_subscribers", e.aggregate_id);
      if (!s) return { skip: "subscriber deleted" };
      const messages: OutboundMessage[] = config.sendUnsubscribeConfirmation
        ? [{ type: "unsubscribe_confirmation", to: s.email, from, ...T.unsubscribeConfirmation(brand()) }]
        : [];
      return { messages, data: { subscriber_id: s.id, unsubscribed_at: s.unsubscribed_at } };
    }
    case "waitlist.registered": {
      const r = await one<Row>("waitlist_registrations", e.aggregate_id);
      if (!r) return { skip: "registration deleted" };
      if (r.status === "removed") return { skip: "registration removed" };
      const p = await one<Row>("saas_products", r.product_id);
      if (!p) return { skip: "product deleted" };
      const { count } = await db().from("waitlist_registrations")
        .select("id", { count: "exact", head: true }).eq("product_id", p.id).neq("status", "removed");
      const messages: OutboundMessage[] = [{
        type: "waitlist_confirmation", to: r.email, from,
        ...T.waitlistConfirmation(brand(), {
          firstName: r.first_name, productName: p.name, productDescription: p.description,
          leaveUrl: await unsubscribeUrl("w", r.id),
        }),
      }];
      if (config.notificationEmail) {
        messages.push({
          type: "waitlist_notification", to: config.notificationEmail, from, reply_to: r.email,
          ...T.waitlistNotification(brand(), {
            productName: p.name, productSlug: p.slug, firstName: r.first_name, email: r.email,
            companyName: r.company_name, additionalInfo: r.additional_info,
            createdAt: new Date(r.created_at).toUTCString(), total: count ?? 0,
          }),
        });
      }
      return { messages, data: { registration_id: r.id, product: { id: p.id, slug: p.slug, name: p.name } } };
    }
    case "contact.submitted": {
      const c = await one<Row>("contact_submissions", e.aggregate_id);
      if (!c) return { skip: "submission deleted" };
      const messages: OutboundMessage[] = [];
      if (config.notificationEmail) {
        messages.push({
          type: "contact_notification", to: config.notificationEmail, from, reply_to: c.email,
          ...T.contactNotification(brand(), {
            fullName: c.full_name, email: c.email, category: c.category, subject: c.subject,
            message: c.message, createdAt: new Date(c.created_at).toUTCString(),
          }),
        });
      }
      messages.push({
        type: "contact_acknowledgement", to: c.email, from,
        ...(config.notificationEmail ? { reply_to: config.notificationEmail } : {}),
        ...T.contactAcknowledgement(brand(), { fullName: c.full_name, responseTime: config.contactResponseTime }),
      });
      return { messages, data: { submission_id: c.id, category: c.category } };
    }
    case "campaign.send_requested": {
      const c = await one<Row>("newsletter_campaigns", e.aggregate_id, "id, identifier, subject, status");
      if (!c) return { skip: "campaign deleted" };
      return { messages: [], data: { campaign_id: c.id, identifier: c.identifier, subject: c.subject } };
    }
    default:
      return { skip: `unknown event type ${e.event_type}` };
  }
}

/** Dispatches one already-claimed event (status = dispatching). */
async function dispatchClaimed(e: AutomationEvent): Promise<string> {
  const url = webhookUrlFor(e.event_type);
  const notReady = !url ? "N8N webhook URL not configured" :
    !config.n8nWebhookSecret ? "N8N_WEBHOOK_SECRET not configured" :
    !config.senderEmail ? "SENDER_EMAIL not configured" :
    !config.tokenSecret ? "UNSUBSCRIBE_TOKEN_SECRET not configured" : "";
  if (notReady) {
    await rpc("release_automation_event", { p_event_id: e.id, p_reason: `Awaiting configuration: ${notReady}` });
    return "awaiting_configuration";
  }

  let built: Built;
  try {
    built = await build(e);
  } catch (err) {
    await rpc("record_dispatch_result", { p_event_id: e.id, p_ok: false, p_http_status: null, p_error: `build: ${err}` });
    return "failed";
  }
  if ("skip" in built) {
    await rpc("skip_automation_event", { p_event_id: e.id, p_reason: built.skip });
    return "skipped";
  }

  // Track each message; never resend one the SMTP server already accepted.
  const { data: existing } = await db().from("email_deliveries")
    .select("message_type, status").eq("event_id", e.id);
  const done = new Set((existing ?? []).filter((d) => ["smtp_accepted", "delivered", "skipped"].includes(d.status)).map((d) => d.message_type));
  const toSend = built.messages.filter((m) => !done.has(m.type));
  if (toSend.length) {
    const { error } = await db().from("email_deliveries").upsert(
      toSend.map((m) => ({ event_id: e.id, message_type: m.type, recipient_email: m.to, status: "pending", error: null })),
      { onConflict: "event_id,message_type" },
    );
    if (error) throw new Error(`email_deliveries: ${error.message}`);
  }
  await db().from("automation_events").update({ expected_messages: built.messages.map((m) => m.type) }).eq("id", e.id);

  const body = {
    event_id: e.id,
    event_type: e.event_type,
    idempotency_key: e.idempotency_key,
    attempt: e.attempts,
    occurred_at: e.created_at,
    callback_url: `${config.functionsUrl}/automation-callback`,
    site: brand(),
    data: built.data,
    messages: toSend,
  };

  let ok = false, status: number | null = null, error = "";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Secret": config.n8nWebhookSecret,
        "Idempotency-Key": e.idempotency_key,
        "X-Event-Id": e.id,
        "X-Event-Type": e.event_type,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    status = res.status;
    ok = res.ok;
    if (!ok) error = `n8n responded ${res.status}: ${(await res.text()).slice(0, 500)}`;
    else await res.body?.cancel();
  } catch (err) {
    error = `n8n unreachable: ${err instanceof Error ? err.message : err}`;
  }
  await rpc("record_dispatch_result", { p_event_id: e.id, p_ok: ok, p_http_status: status, p_error: error || null });
  return ok ? "dispatched" : "failed";
}

/** Claims and dispatches due events (or one specific event). */
export async function dispatchDue(limit = 20, eventId: string | null = null) {
  const events = await rpc<AutomationEvent[]>("claim_automation_events", { p_limit: limit, p_event_id: eventId });
  const results: Record<string, number> = {};
  for (const e of events ?? []) {
    let r: string;
    try {
      r = await dispatchClaimed(e);
    } catch (err) {
      console.error(`dispatch ${e.id} failed`, err);
      await rpc("record_dispatch_result", { p_event_id: e.id, p_ok: false, p_http_status: null, p_error: String(err) }).catch(() => {});
      r = "failed";
    }
    results[r] = (results[r] ?? 0) + 1;
  }
  return { claimed: events?.length ?? 0, results };
}

/** Immediate best-effort dispatch right after a form submission. */
export const dispatchNow = (eventId: string | null | undefined) =>
  eventId ? dispatchDue(1, eventId) : Promise.resolve(null);
