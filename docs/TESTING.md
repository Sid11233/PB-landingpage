# Testing

## Automated end-to-end suite (local)

`tests/e2e.local.mjs` drives a real browser against the full local stack: Supabase (Postgres + Edge Functions), a real n8n with workflows A–F imported, and Mailpit as the SMTP server. It checks the database, the emails as received, and the n8n behaviour.

### Run it
```bash
npm install && npx playwright install --with-deps chromium
npx supabase start
npx supabase db reset
cp .env.example supabase/functions/.env   # then use local values, see below
npx supabase functions serve --env-file supabase/functions/.env &

# n8n on the Supabase Docker network, with test credentials pointing at Mailpit (host supabase_inbucket_<project>, port 1025, no TLS)
docker run -d --name sj-n8n --network supabase_network_sid-jugasing -p 5678:5678 n8nio/n8n:1.123.5
# import the 3 credentials + n8n/workflows/*.json, activate all six (UI or REST API)

PUBLIC_API_BASE_URL=http://127.0.0.1:54321/functions/v1 INSTAGRAM_URL=https://instagram.com/x npm run build
node scripts/serve.mjs &
node tests/e2e.local.mjs
```
The local `supabase/functions/.env` used for the run had: `SITE_URL=http://localhost:8080`, `ALLOWED_ORIGINS=http://localhost:8080`, `PUBLIC_FUNCTIONS_URL=http://supabase_kong_sid-jugasing:8000/functions/v1`, `N8N_BASE_URL=http://sj-n8n:5678`, and the secrets hard-coded at the top of the test file.

### Result (3 November 2026): 34 passed, 0 failed (two consecutive full runs)

**Newsletter:** valid subscription via the form · confirmation email via n8n→SMTP, with only the token hash stored · invalid email (client + server) · missing consent · duplicate (same response, no duplicate row/email) · valid confirmation → active + welcome email · reused token · invalid token · expired token · unsubscribe + tampered token rejected · resubscribe → pending + new confirmation.

**Campaigns:** only `active` subscribers receive it (pending and unsubscribed excluded), personalised subject/body and unsubscribe links, a re-run sends to nobody twice.

**Waiting list:** product association · product-specific confirmation (does not echo visitor text) · internal notification with reply-to · no newsletter subscription · multiple products per person · duplicate prevented · closed/unknown product refused · explicit newsletter opt-in creates a separate *pending* subscription · leave-list link.

**Contact:** valid submission, with notification (reply-to sender, HTML-escaped) and acknowledgement (does not echo the message) · missing fields / invalid email · honeypot + instant-submit dropped · rate limit 429 · foreign origin 403.

**Automation:** n8n webhooks reject missing secret · callback/dispatcher reject missing secret · duplicate webhook replay sends nothing · **n8n stopped** → submission saved, event `failed` with error, retried to completion · **SMTP server stopped** → both deliveries `failed` with the SMTP error, source record shows `failed`, retry delivers.

**Website:** no console errors and no horizontal scroll on 5 pages × 3 widths (1360/768/390) · SEO tags, single h1, sitemap, robots, OG image · social links `target=_blank rel=noopener` with labels, unconfigured ones hidden · no secrets in `dist/`.

### Also verified
- **Design fidelity:** the original export and the rebuilt page were rendered in Chromium and pixel-compared from the top of the page down to the waitlist section. Section heights are identical and pixel difference is 0.010% / 0.018% / 0.028% at 1360 / 768 / 390 px (anti-aliasing only).
- **Public API lockdown:** with the publishable key, the Supabase REST API returns `permission denied` for every table and every function.
- Migrations apply cleanly to an empty database (`supabase db reset`).

## Not yet testable (awaiting your configuration)
- Real **Hostinger SMTP** authentication and deliverability (SPF/DKIM/DMARC). Locally, SMTP failures were simulated by stopping the SMTP server (connection errors); an *authentication* rejection follows the same failure path but couldn't be reproduced against Mailpit.
- Your production n8n instance and the deployed Supabase project.
- Real inbox placement (spam folder vs inbox). Use mail-tester.com after DNS setup.
