// Central server-side configuration. Every value comes from Supabase function
// secrets (`supabase secrets set ...`) — nothing secret is ever sent to the browser.
const env = (key: string, fallback = ""): string => (Deno.env.get(key) ?? fallback).trim();
const trimSlash = (s: string) => s.replace(/\/+$/, "");

const supabaseUrl = trimSlash(env("SUPABASE_URL"));
const n8nBase = trimSlash(env("N8N_BASE_URL"));

/** Default webhook paths — these match the paths in the exported n8n workflows. */
export const DEFAULT_WEBHOOK_PATHS: Record<string, string> = {
  "newsletter.confirmation_requested": "sj-newsletter-subscribe",
  "newsletter.confirmed": "sj-newsletter-confirmed",
  "waitlist.registered": "sj-waitlist",
  "contact.submitted": "sj-contact",
  "newsletter.unsubscribed": "sj-unsubscribe",
  "campaign.send_requested": "sj-campaign",
};

const explicitWebhooks: Record<string, string> = {
  "newsletter.confirmation_requested": env("N8N_NEWSLETTER_WEBHOOK_URL"),
  "newsletter.confirmed": env("N8N_NEWSLETTER_CONFIRMATION_WEBHOOK_URL"),
  "waitlist.registered": env("N8N_WAITLIST_WEBHOOK_URL"),
  "contact.submitted": env("N8N_CONTACT_WEBHOOK_URL"),
  "newsletter.unsubscribed": env("N8N_UNSUBSCRIBE_WEBHOOK_URL"),
  "campaign.send_requested": env("N8N_CAMPAIGN_WEBHOOK_URL"),
};

export const config = {
  supabaseUrl,
  serviceRoleKey: env("SUPABASE_SERVICE_ROLE_KEY"),
  siteUrl: trimSlash(env("SITE_URL", "http://localhost:8080")),
  siteName: env("SITE_NAME", "Sid Jugasing"),
  /** Publicly reachable base for these functions (used for n8n callbacks). */
  functionsUrl: trimSlash(env("PUBLIC_FUNCTIONS_URL") || `${supabaseUrl}/functions/v1`),
  allowedOrigins: env("ALLOWED_ORIGINS").split(",").map((s) => trimSlash(s.trim())).filter(Boolean),

  senderEmail: env("SENDER_EMAIL"),
  senderName: env("SENDER_NAME", env("SITE_NAME", "Sid Jugasing")),
  notificationEmail: env("NOTIFICATION_EMAIL"),
  /** Optional: e.g. "I usually reply within two working days." Empty = no promise. */
  contactResponseTime: env("CONTACT_RESPONSE_TIME"),
  sendUnsubscribeConfirmation: env("SEND_UNSUBSCRIBE_CONFIRMATION") === "true",
  confirmTokenTtlHours: Number(env("CONFIRM_TOKEN_TTL_HOURS", "72")) || 72,

  n8nWebhookSecret: env("N8N_WEBHOOK_SECRET"),
  callbackSecret: env("AUTOMATION_CALLBACK_SECRET"),
  dispatchSecret: env("DISPATCH_SECRET"),
  tokenSecret: env("UNSUBSCRIBE_TOKEN_SECRET"),
  rateLimitSalt: env("RATE_LIMIT_SALT", env("UNSUBSCRIBE_TOKEN_SECRET")),
};

/** Resolves the n8n webhook for an event type: explicit URL first, then N8N_BASE_URL + default path. */
export function webhookUrlFor(eventType: string): string {
  const explicit = explicitWebhooks[eventType];
  if (explicit) return explicit;
  const path = DEFAULT_WEBHOOK_PATHS[eventType];
  return n8nBase && path ? `${n8nBase}/webhook/${path}` : "";
}

/** Lists missing settings so endpoints can fail closed with a clear message. */
export function missing(...keys: (keyof typeof config)[]): string[] {
  return keys.filter((k) => !config[k]);
}
