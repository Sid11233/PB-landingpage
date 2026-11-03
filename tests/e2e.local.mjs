// End-to-end tests against the LOCAL stack (see docs/TESTING.md):
//   supabase start + functions serve, n8n container "sj-n8n" with workflows A–F active,
//   Mailpit (Supabase's inbucket) as the SMTP server, and `npm run dev` on :8080
//   built with PUBLIC_API_BASE_URL=http://127.0.0.1:54321/functions/v1.
//
// Run: node tests/e2e.local.mjs
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const SITE = "http://localhost:8080";
const FN = "http://127.0.0.1:54321/functions/v1";
const MAILPIT = "http://127.0.0.1:54324/api/v1";
const N8N = "http://127.0.0.1:5678";
const DB_CONTAINER = "supabase_db_sid-jugasing";
const SECRETS = {
  dispatch: "local-dispatch-secret-0123456789abcdef",
  callback: "local-callback-secret-0123456789abcdef",
  webhook: "local-n8n-webhook-secret-0123456789abcdef",
};

// ---------------------------------------------------------------------------
let passed = 0, failed = 0;
const results = [];
async function test(name, fn) {
  try { await fn(); passed++; results.push(`  ✓ ${name}`); console.log(`  ✓ ${name}`); }
  catch (e) { failed++; results.push(`  ✗ ${name}\n      ${e.message}`); console.log(`  ✗ ${name}\n      ${e.message}`); }
}
const assert = (c, msg) => { if (!c) throw new Error(msg); };
const eq = (a, b, msg) => assert(a === b, `${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, msg, timeout = 30000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { last = await fn(); if (last) return last; await sleep(500); }
  throw new Error(`timed out: ${msg}`);
}

function sql(q) {
  const out = execFileSync("docker", ["exec", DB_CONTAINER, "psql", "-U", "postgres", "-tA", "-c", q], { encoding: "utf8" }).trim();
  return out;
}
const rows = (q) => JSON.parse(sql(`select coalesce(json_agg(t), '[]') from (${q}) t`) || "[]");
const one = (q) => rows(q)[0];

async function post(fn, body, headers = {}) {
  const res = await fetch(`${FN}/${fn}`, { method: "POST", headers: { "content-type": "application/json", origin: SITE, ...headers }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const dispatch = () => post("automation-dispatch", {}, { "x-dispatch-secret": SECRETS.dispatch });
const callback = (body) => post("automation-callback", body, { "x-automation-secret": SECRETS.callback });

async function mails(to) {
  const r = await (await fetch(`${MAILPIT}/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json();
  return r.messages ?? [];
}
const mailBody = async (id) => (await fetch(`${MAILPIT}/message/${id}`)).json();
const waitMail = (to, subjectPart, n = 1) =>
  until(async () => { const m = (await mails(to)).filter((x) => x.Subject.includes(subjectPart)); return m.length >= n ? m : null; }, `${n} email(s) "${subjectPart}" to ${to}`);

const resetLimits = () => sql("delete from rate_limits");
const uniq = (p) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`;
const human = { website: "", elapsed_ms: 8000 };

// ---------------------------------------------------------------------------
await fetch(`${MAILPIT}/messages`, { method: "DELETE" });
resetLimits();
const browser = await chromium.launch();
const consoleErrors = [];
async function newPage(width = 1360) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(`${page.url()}: ${m.text()}`); });
  page.on("pageerror", (e) => consoleErrors.push(`${page.url()}: ${e}`));
  return page;
}

console.log("\nNewsletter");
const alice = uniq("alice");
let confirmUrl, unsubscribeUrl;

await test("valid subscription via the website form stores a pending subscriber", async () => {
  const page = await newPage();
  await page.goto(SITE + "/");
  await page.waitForTimeout(1600); // humans take longer than the bot threshold
  await page.fill("#nl-first", "Alice");
  await page.fill("#nl-email", alice);
  await page.check('#newsletter input[name="consent"]');
  await page.click('#newsletter button[type="submit"]');
  await page.waitForSelector("#newsletter [data-success]:not([hidden])");
  const s = one(`select status, first_name, consent_at is not null as consent, consent_text from newsletter_subscribers where email='${alice}'`);
  eq(s.status, "pending", "status"); eq(s.first_name, "Alice", "first name"); eq(s.consent, true, "consent recorded");
  assert(s.consent_text.includes("unsubscribe"), "consent wording stored");
  await page.close();
});

await test("confirmation email is sent via n8n → SMTP and only a token HASH is stored", async () => {
  const [m] = await waitMail(alice, "Confirm your subscription");
  const full = await mailBody(m.ID);
  confirmUrl = /(http:\/\/localhost:8080\/newsletter\/confirm\/\?token=[A-Za-z0-9_-]+)/.exec(full.Text)?.[1];
  assert(confirmUrl, "confirm link in text body");
  assert(full.HTML.includes("Confirm subscription"), "HTML body has button");
  const token = new URL(confirmUrl).searchParams.get("token");
  const stored = sql(`select count(*) from newsletter_tokens where token_hash = '${token}'`);
  eq(stored, "0", "plaintext token must not be stored");
  const d = await until(() => one(`select d.status, d.smtp_message_id from email_deliveries d join automation_events e on e.id=d.event_id where d.recipient_email='${alice}' and d.message_type='newsletter_confirmation' and d.status='smtp_accepted'`), "delivery status smtp_accepted");
  assert(d.smtp_message_id, "SMTP message id recorded");
});

await test("invalid email is rejected (client-side and server-side)", async () => {
  const page = await newPage();
  await page.goto(SITE + "/");
  await page.fill("#nl-email", "not-an-email");
  await page.check('#newsletter input[name="consent"]');
  await page.click('#newsletter button[type="submit"]');
  const err = await page.textContent("#newsletter [data-error]");
  assert(/valid email/i.test(err), "client error shown");
  eq(await page.getAttribute("#nl-email", "aria-invalid"), "true", "aria-invalid set");
  await page.close();
  const r = await post("newsletter-subscribe", { email: "a@b", consent: true, ...human });
  eq(r.status, 400, "server status"); assert(r.body.fields.email, "server field error");
});

await test("subscription without consent is rejected server-side", async () => {
  const r = await post("newsletter-subscribe", { email: uniq("noconsent"), consent: false, ...human });
  eq(r.status, 400, "status"); assert(r.body.fields.consent, "consent error");
});

await test("duplicate subscription: same response, no duplicate row, no extra email within cooldown", async () => {
  const before = sql(`select count(*) from automation_events where aggregate_id = (select id from newsletter_subscribers where email='${alice}')`);
  const r = await post("newsletter-subscribe", { email: alice.toUpperCase(), consent: true, ...human });
  eq(r.status, 200, "status"); eq(r.body.status, "check_inbox", "generic response");
  eq(sql(`select count(*) from newsletter_subscribers where email='${alice}'`), "1", "single row");
  eq(sql(`select count(*) from automation_events where aggregate_id = (select id from newsletter_subscribers where email='${alice}')`), before, "no new event");
});

await test("valid confirmation link activates the subscription and sends the welcome email", async () => {
  const page = await newPage();
  await page.goto(confirmUrl);
  await page.waitForSelector('[data-state="confirmed"]:not([hidden])');
  assert(!page.url().includes("token="), "token removed from address bar");
  await page.close();
  const s = one(`select status, confirmed_at is not null as confirmed from newsletter_subscribers where email='${alice}'`);
  eq(s.status, "active", "status"); eq(s.confirmed, true, "confirmed_at");
  const [w] = await waitMail(alice, "Thanks for joining");
  const full = await mailBody(w.ID);
  assert(full.Text.includes("No unnecessary noise."), "welcome copy");
  unsubscribeUrl = /(http:\/\/localhost:8080\/newsletter\/unsubscribe\/\?token=[^\s]+)/.exec(full.Text)?.[1];
  assert(unsubscribeUrl, "welcome email has unsubscribe link");
});

await test("re-used confirmation token → already confirmed (single use, no 2nd welcome)", async () => {
  const token = new URL(confirmUrl).searchParams.get("token");
  const r = await post("newsletter-confirm", { token });
  eq(r.body.result, "already_confirmed", "result");
  await sleep(3000);
  eq((await mails(alice)).filter((m) => m.Subject.includes("Thanks for joining")).length, 1, "welcome count");
});

await test("invalid token → invalid (page shows resubscribe form)", async () => {
  const r = await post("newsletter-confirm", { token: "x".repeat(43) });
  eq(r.body.result, "invalid", "result");
  const page = await newPage();
  await page.goto(SITE + "/newsletter/confirm/?token=" + "y".repeat(43));
  await page.waitForSelector('[data-state="invalid"]:not([hidden])');
  assert(await page.isVisible("[data-resubscribe]"), "resubscribe form visible");
  await page.close();
});

await test("expired token → expired, subscriber stays pending", async () => {
  const bob = uniq("bob");
  await post("newsletter-subscribe", { email: bob, consent: true, ...human });
  const [m] = await waitMail(bob, "Confirm your subscription");
  const token = /token=([A-Za-z0-9_-]{43})/.exec((await mailBody(m.ID)).Text)[1];
  sql(`update newsletter_tokens set expires_at = now() - interval '1 hour' where subscriber_id = (select id from newsletter_subscribers where email='${bob}')`);
  const r = await post("newsletter-confirm", { token });
  eq(r.body.result, "expired", "result");
  eq(one(`select status from newsletter_subscribers where email='${bob}'`).status, "pending", "still pending");
});

await test("pending subscribers never receive campaigns", async () => {
  // covered with the campaign test below (bob is pending)
});

await test("unsubscribe link → status unsubscribed + timestamp; tampered token rejected", async () => {
  const bad = unsubscribeUrl.slice(0, -3) + "abc";
  const r = await post("newsletter-unsubscribe", { token: new URL(bad).searchParams.get("token") });
  eq(r.body.result, "invalid", "tampered token rejected");
  const page = await newPage(390);
  await page.goto(unsubscribeUrl);
  await page.click("[data-unsubscribe]");
  await page.waitForSelector('[data-state="done"]:not([hidden])');
  await page.close();
  const s = one(`select status, unsubscribed_at is not null as ts from newsletter_subscribers where email='${alice}'`);
  eq(s.status, "unsubscribed", "status"); eq(s.ts, true, "unsubscribed_at");
  await until(() => one(`select 1 from automation_events where event_type='newsletter.unsubscribed' and status='completed' and aggregate_id=(select id from newsletter_subscribers where email='${alice}')`), "workflow F processed");
});

console.log("\nCampaigns");
await test("campaign goes only to ACTIVE subscribers (excludes pending + unsubscribed), with personal unsubscribe links", async () => {
  const carol = uniq("carol");
  sql(`insert into newsletter_subscribers (email, first_name, status, consent_at, confirmed_at) values ('${carol}', 'Carol', 'active', now(), now())`);
  const id = `test-${Date.now()}`;
  sql(`insert into newsletter_campaigns (identifier, subject, html_body, text_body) values ('${id}', 'Test issue for {{first_name_or_there}}', '<p>Hello {{first_name_or_there}}</p>', 'Hello {{first_name_or_there}}')`);
  sql(`select public.request_campaign_send('${id}')`);
  await dispatch();
  const status = await until(() => { const c = one(`select status from newsletter_campaigns where identifier='${id}'`); return c.status === "sent" ? c : null; }, "campaign sent", 60000);
  eq(status.status, "sent", "campaign status");
  const recips = rows(`select r.email, r.status from campaign_recipients r join newsletter_campaigns c on c.id=r.campaign_id where c.identifier='${id}'`);
  assert(recips.some((r) => r.email === carol && r.status === "smtp_accepted"), "active subscriber received it");
  assert(!recips.some((r) => r.email === alice), "unsubscribed subscriber excluded");
  assert(!recips.some((r) => r.email.startsWith("bob-")), "pending subscriber excluded");
  const [m] = await waitMail(carol, "Test issue for Carol");
  assert((await mailBody(m.ID)).Text.includes("/newsletter/unsubscribe/?token=n."), "personal unsubscribe link");
  // re-running the campaign must not resend
  sql(`update newsletter_campaigns set status='sending' where identifier='${id}'`);
  await callback({ action: "campaign.start", identifier: id });
  const batch = await callback({ action: "campaign.next_batch", campaign_id: one(`select id from newsletter_campaigns where identifier='${id}'`).id });
  eq(batch.body.count, 0, "nobody is sent the same campaign twice");
});

await test("resubscribe after unsubscribe → pending again + new confirmation email", async () => {
  resetLimits();
  const r = await post("newsletter-subscribe", { email: alice, consent: true, ...human });
  eq(r.status, 200, "status");
  eq(one(`select status from newsletter_subscribers where email='${alice}'`).status, "pending", "pending again");
  await waitMail(alice, "Confirm your subscription", 2);
});

console.log("\nSaaS waiting list");
sql(`insert into saas_products (slug, name, description, status) values ('second-product', 'Second Product', 'Another test product.', 'waitlist_open') on conflict (slug) do nothing`);
sql(`insert into saas_products (slug, name, status) values ('closed-product', 'Closed', 'draft') on conflict (slug) do nothing`);
const dan = uniq("dan");

await test("registration via the website form is linked to the right product", async () => {
  resetLimits();
  const page = await newPage(768);
  await page.goto(SITE + "/");
  await page.waitForTimeout(1600);
  await page.fill("#wl-first-product-first", "Dan");
  await page.fill("#wl-first-product-email", dan);
  await page.fill("#wl-first-product-company", "Dan Co");
  await page.fill("#wl-first-product-info", "Testing");
  await page.click('#waitlist button[type="submit"]');
  await page.waitForSelector("#waitlist [data-success]:not([hidden])");
  await page.close();
  const r = one(`select p.slug, w.company_name, w.additional_info from waitlist_registrations w join saas_products p on p.id=w.product_id where w.email='${dan}'`);
  eq(r.slug, "first-product", "product"); eq(r.company_name, "Dan Co", "company");
});

await test("product confirmation email + internal notification (reply-to registrant)", async () => {
  const [m] = await waitMail(dan, "waiting list");
  const body = await mailBody(m.ID);
  assert(body.Text.includes("[Product name]"), "product name inserted");
  assert(!body.Text.includes("Dan Co") && !body.Text.includes("Testing"), "does not echo visitor's free text");
  const [n] = await waitMail("owner@sid.test", "New waitlist signup");
  const nb = await mailBody(n.ID);
  assert(nb.Text.includes(dan) && nb.Text.includes("Dan Co"), "notification includes details");
  eq(nb.ReplyTo?.[0]?.Address, dan, "reply-to");
  await until(() => one(`select 1 from waitlist_registrations where email='${dan}' and confirmation_email_status='smtp_accepted' and notification_email_status='smtp_accepted'`), "statuses synced to registration");
});

await test("joining a waiting list does NOT subscribe to the newsletter", async () => {
  eq(sql(`select count(*) from newsletter_subscribers where email='${dan}'`), "0", "no subscriber row");
});

await test("same person can join a different product; duplicate for same product is prevented", async () => {
  const a = await post("waitlist-join", { product_slug: "second-product", first_name: "Dan", email: dan, ...human });
  eq(a.status, 200, "second product");
  const b = await post("waitlist-join", { product_slug: "second-product", first_name: "Dan", email: dan, ...human });
  eq(b.status, 200, "duplicate gets same response");
  eq(sql(`select count(*) from waitlist_registrations where email='${dan}'`), "2", "two registrations total");
  await waitMail(dan, "Second Product");
  await sleep(2500);
  eq((await mails(dan)).filter((m) => m.Subject.includes("Second Product")).length, 1, "no duplicate email");
});

await test("closed / unknown products are refused; missing first name rejected", async () => {
  eq((await post("waitlist-join", { product_slug: "closed-product", first_name: "X", email: uniq("x"), ...human })).status, 409, "closed");
  eq((await post("waitlist-join", { product_slug: "nope", first_name: "X", email: uniq("x"), ...human })).status, 409, "unknown");
  const r = await post("waitlist-join", { product_slug: "first-product", email: uniq("x"), ...human });
  eq(r.status, 400, "missing name"); assert(r.body.fields.first_name, "field error");
});

await test("explicit newsletter opt-in checkbox on the waitlist form creates a separate PENDING subscription", async () => {
  resetLimits();
  const erin = uniq("erin");
  const page = await newPage();
  await page.goto(SITE + "/waitlist/first-product/");
  await page.waitForTimeout(1600);
  await page.fill("#wl-first-product-first", "Erin");
  await page.fill("#wl-first-product-email", erin);
  await page.check('input[name="newsletter_opt_in"]');
  await page.click('button[type="submit"]');
  await page.waitForSelector("[data-newsletter-note]:not([hidden])");
  await page.close();
  eq(one(`select status, source from newsletter_subscribers where email='${erin}'`).status, "pending", "pending (double opt-in)");
});

await test("waiting-list leave link works", async () => {
  const [m] = await waitMail(dan, "Second Product");
  const url = /(http:\/\/localhost:8080\/newsletter\/unsubscribe\/\?token=w\.[^\s]+)/.exec((await mailBody(m.ID)).Text)?.[1];
  assert(url, "leave link present");
  const r = await post("newsletter-unsubscribe", { token: new URL(url).searchParams.get("token") });
  eq(r.body.result, "unsubscribed", "result");
  eq(one(`select w.status from waitlist_registrations w join saas_products p on p.id=w.product_id where w.email='${dan}' and p.slug='second-product'`).status, "removed", "status removed");
});

console.log("\nContact form");
const frank = uniq("frank");
await test("valid submission via the website → stored, notification (reply-to sender) + acknowledgement", async () => {
  resetLimits();
  const page = await newPage(390);
  await page.goto(SITE + "/");
  await page.waitForTimeout(3200);
  await page.fill("#contact-name", "Frank Ocean");
  await page.fill("#contact-email", frank);
  await page.selectOption("#contact-category", "collaboration");
  await page.fill("#contact-subject", "Let's build something");
  await page.fill("#contact-message", "Hello Sid, I'd like to talk about a project. <b>html</b> stays text.");
  await page.click('#contact-form button[type="submit"]');
  await page.waitForSelector("#contact-form [data-success]:not([hidden])");
  await page.close();
  const c = one(`select category, status from contact_submissions where email='${frank}'`);
  eq(c.category, "collaboration", "category"); eq(c.status, "new", "status");
  const [n] = await waitMail("owner@sid.test", "Let's build something");
  const nb = await mailBody(n.ID);
  eq(nb.ReplyTo?.[0]?.Address, frank, "reply-to sender");
  assert(nb.HTML.includes("&lt;b&gt;html&lt;/b&gt;"), "message HTML-escaped");
  assert(nb.Text.includes("Collaboration"), "category label");
  const [a] = await waitMail(frank, "Thanks for reaching out");
  const ab = await mailBody(a.ID);
  assert(ab.Text.includes("Hi Frank,"), "first name greeting");
  assert(!ab.Text.includes("build something"), "ack does not echo the message");
  await until(() => one(`select 1 from contact_submissions where email='${frank}' and notification_status='smtp_accepted' and acknowledgement_status='smtp_accepted'`), "statuses synced");
});

await test("missing fields and invalid email are rejected with field errors", async () => {
  const r = await post("contact-submit", { email: "bad", ...human });
  eq(r.status, 400, "status");
  for (const f of ["full_name", "email", "category", "subject", "message"]) assert(r.body.fields[f], `field ${f}`);
});

await test("spam protection: honeypot and instant submissions are silently dropped", async () => {
  const before = sql("select count(*) from contact_submissions");
  const base = { full_name: "Bot", email: uniq("bot"), category: "other", subject: "Spam", message: "Buy things now please" };
  eq((await post("contact-submit", { ...base, website: "http://spam", elapsed_ms: 9000 })).status, 200, "honeypot looks successful");
  eq((await post("contact-submit", { ...base, website: "", elapsed_ms: 200 })).status, 200, "too fast looks successful");
  eq(sql("select count(*) from contact_submissions"), before, "nothing stored");
});

await test("rate limiting returns 429 after the limit", async () => {
  resetLimits();
  const base = { full_name: "Rate Test", email: uniq("rate"), category: "other", subject: "Rate", message: "Rate limit test message", ...human };
  const codes = [];
  for (let i = 0; i < 6; i++) codes.push((await post("contact-submit", base)).status);
  assert(codes.includes(429), `got ${codes.join(",")}`);
  resetLimits();
});

await test("requests from other websites (CORS origin) are refused", async () => {
  const r = await post("newsletter-subscribe", { email: uniq("x"), consent: true, ...human }, { origin: "https://evil.example" });
  eq(r.status, 403, "status");
});

console.log("\nAutomation & reliability");
await test("n8n webhooks reject requests without the shared secret", async () => {
  const r = await fetch(`${N8N}/webhook/sj-contact`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert(r.status === 403 || r.status === 401, `status ${r.status}`);
});

await test("callback endpoint and dispatcher reject requests without their secrets", async () => {
  eq((await post("automation-callback", { action: "event.claim", event_id: "00000000-0000-0000-0000-000000000000" })).status, 401, "callback");
  eq((await post("automation-dispatch", {})).status, 401, "dispatcher");
});

await test("duplicate event delivery is ignored (claim is idempotent)", async () => {
  const e = one(`select id from automation_events where event_type='contact.submitted' and status='completed' limit 1`);
  const r = await callback({ action: "event.claim", event_id: e.id });
  eq(r.body.proceed, false, "second claim refused");
  // replay the webhook straight into n8n with the right secret: must not resend
  const before = (await mails(frank)).length;
  await fetch(`${N8N}/webhook/sj-contact`, { method: "POST", headers: { "content-type": "application/json", "X-Webhook-Secret": SECRETS.webhook },
    body: JSON.stringify({ event_id: e.id, callback_url: "http://supabase_kong_sid-jugasing:8000/functions/v1/automation-callback", messages: [{ type: "contact_acknowledgement", to: frank, from: "x <hello@sid.test>", subject: "DUP", html: "x", text: "x" }] }) });
  await sleep(4000);
  eq((await mails(frank)).length, before, "no duplicate email sent");
});

await test("n8n down → submission still saved, event retried until delivered", async () => {
  execFileSync("docker", ["stop", "sj-n8n"]);
  const gina = uniq("gina");
  resetLimits();
  const r = await post("contact-submit", { full_name: "Gina", email: gina, category: "general", subject: "While n8n is down", message: "Is anyone there at all?", ...human });
  eq(r.status, 200, "user still gets success (message IS saved)");
  const e = await until(() => one(`select e.status, e.last_error from automation_events e join contact_submissions c on c.id=e.aggregate_id where c.email='${gina}' and e.status='failed'`), "event marked failed");
  assert(/unreachable/.test(e.last_error), "error recorded");
  eq(one(`select acknowledgement_status from contact_submissions where email='${gina}'`).acknowledgement_status, "pending", "email not claimed as sent");
  execFileSync("docker", ["start", "sj-n8n"]);
  await until(async () => (await fetch(`${N8N}/healthz`).catch(() => ({ ok: false }))).ok, "n8n back", 60000);
  await sleep(4000);
  sql(`update automation_events set next_attempt_at = now() where status='failed'`);
  await dispatch();
  await waitMail(gina, "Thanks for reaching out");
  await until(() => one(`select 1 from automation_events e join contact_submissions c on c.id=e.aggregate_id where c.email='${gina}' and e.status='completed' and e.attempts=2`), "completed on 2nd attempt");
});

await test("SMTP failure → delivery marked failed with the SMTP error, retried, and only unsent emails are resent", async () => {
  execFileSync("docker", ["stop", "supabase_inbucket_sid-jugasing"]);
  try {
  const hal = uniq("hal");
  resetLimits();
  await post("contact-submit", { full_name: "Hal", email: hal, category: "technology", subject: "SMTP down test", message: "Testing SMTP failure path.", ...human });
  const d = await until(() => { const x = rows(`select d.status, d.error from email_deliveries d join automation_events e on e.id=d.event_id join contact_submissions c on c.id=e.aggregate_id where c.email='${hal}'`); return x.length === 2 && x.every((y) => y.status === "failed") ? x : null; }, "both deliveries failed", 240000);
  assert(d[0].error && d[0].error.length > 3, `SMTP error recorded: ${d[0].error}`);
  eq(one(`select e.status from automation_events e join contact_submissions c on c.id=e.aggregate_id where c.email='${hal}'`).status, "failed", "event scheduled for retry");
  eq(one(`select notification_status from contact_submissions where email='${hal}'`).notification_status, "failed", "source record status");
  execFileSync("docker", ["start", "supabase_inbucket_sid-jugasing"]);
  await sleep(4000);
  sql(`update automation_events set next_attempt_at = now() where status='failed'`);
  await dispatch();
  await waitMail(hal, "Thanks for reaching out");
  await until(() => one(`select 1 from contact_submissions where email='${hal}' and notification_status='smtp_accepted' and acknowledgement_status='smtp_accepted'`), "both accepted after retry");
  } finally { execFileSync("docker", ["start", "supabase_inbucket_sid-jugasing"]); }
});

console.log("\nWebsite");
await test("pages render without console errors at desktop, tablet and mobile", async () => {
  for (const w of [1360, 768, 390]) for (const path of ["/", "/waitlist/first-product/", "/privacy/", "/terms/", "/does-not-exist"]) {
    const page = await newPage(w);
    await page.goto(SITE + path, { waitUntil: "networkidle" });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert(overflow <= 0, `${path} @${w}px scrolls horizontally by ${overflow}px`);
    await page.close();
  }
  const relevant = consoleErrors.filter((e) => !/does-not-exist/.test(e));
  assert(relevant.length === 0, relevant.join("\n"));
});

await test("SEO metadata, canonical, OG image, sitemap, robots present", async () => {
  const html = await (await fetch(SITE + "/")).text();
  for (const s of ['<title>', 'name="description"', 'rel="canonical"', 'property="og:image"', 'twitter:card', 'application/ld+json', '<h1']) assert(html.includes(s), `missing ${s}`);
  eq((html.match(/<h1/g) || []).length, 1, "exactly one h1");
  assert((await fetch(SITE + "/sitemap.xml")).ok && (await fetch(SITE + "/robots.txt")).ok && (await fetch(SITE + "/og-image.png")).ok, "files");
});

await test("social links: configured ones open in a new tab with rel=noopener, unconfigured are hidden", async () => {
  const page = await newPage();
  await page.goto(SITE + "/");
  const links = await page.$$eval("a.social", (as) => as.map((a) => ({ t: a.textContent.trim(), target: a.target, rel: a.rel, label: a.getAttribute("aria-label") })));
  assert(links.length >= 1, "some links");
  for (const l of links) { eq(l.target, "_blank", `${l.t} target`); assert(l.rel.includes("noopener"), `${l.t} rel`); assert(l.label, `${l.t} label`); }
  assert(!links.some((l) => l.t === "TikTok"), "TikTok (unconfigured in this build) hidden");
  await page.close();
});

await test("no secrets or service keys in the built site", async () => {
  let out = "";
  try {
    out = execFileSync("grep", ["-rIlE", "service_role|sb_secret|SUPABASE_SERVICE_ROLE|local-(dispatch|callback|n8n-webhook|token)-secret|N8N_WEBHOOK|/webhook/", "dist"], { encoding: "utf8", cwd: new URL("..", import.meta.url).pathname }).trim();
  } catch (e) { if (e.status !== 1) throw e; } // grep exit 1 = no matches
  assert(!out, `found in: ${out}`);
});

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
