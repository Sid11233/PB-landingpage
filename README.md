# Sid Jugasing: personal brand website

The production version of the Sid Jugasing landing page: a static site that keeps the original design, plus a Supabase backend and n8n email automation.

- **Newsletter** with explicit consent, double opt-in, welcome email, one-click unsubscribe and campaigns.
- **SaaS waiting lists**, reusable for any number of products (`/waitlist/<slug>/`), each with a confirmation email and a notification to you.
- **Contact form** with a notification to you (reply-to = sender) and an acknowledgement to the sender.
- **Reliable delivery:** transactional outbox, retries with backoff, idempotency, and per-email status (`dispatched` ≠ `smtp_accepted` ≠ delivered).
- **Secure by default:** RLS on every table, no keys in the browser, rate limiting, honeypots, validation, CSP and security headers.
- **SEO:** meta and Open Graph tags, share image, favicons, sitemap, robots.txt and JSON-LD. Fonts are self-hosted and no framework is shipped.

## Quick start
```bash
npm install
npm run dev          # builds dist/ and serves it on http://localhost:8080
```
Forms show "not connected yet" until `PUBLIC_API_BASE_URL` points at your Supabase functions.

## Where things are configured
| What | Where |
|---|---|
| Links, contact email, socials, products, SEO, analytics | **`site.config.mjs`** (or the env vars in `.env.example` §1) |
| Server secrets, sender and notification emails, n8n URLs | Supabase function secrets (`.env.example` §2) |
| SMTP mailbox and password | n8n credential **Hostinger SMTP** only |

## Docs
- **[docs/SETUP.md](docs/SETUP.md):** step by step: Supabase, importing the n8n workflows, Hostinger SMTP, DNS, deployment
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md):** data model, statuses, endpoints, campaigns, adding products, privacy operations, admin dashboard prep
- **[docs/TESTING.md](docs/TESTING.md):** end-to-end test suite and results

## Commands
| Command | Does |
|---|---|
| `npm run build` | Builds `dist/` and prints anything still unconfigured |
| `npm run dev` | Builds and serves locally |
| `npm run products:sql` | SQL to sync `site.config.mjs` products into Supabase |
| `node scripts/render-images.mjs` | Regenerates the share image and icons |
| `node tests/e2e.local.mjs` | End-to-end tests (local stack required, see docs/TESTING.md) |

The original design files are in `design/` for reference.
