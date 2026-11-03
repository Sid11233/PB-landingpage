# Setup and deployment guide

Follow these steps in order. Steps marked **⏳ after domain** depend on buying the domain and Hostinger email; everything else can be done now.

1. [Supabase](#1-supabase)
2. [n8n: import and connect the workflows](#2-n8n-import-and-connect-the-workflows)
3. [Hostinger email + SMTP in n8n](#3-hostinger-email--smtp-in-n8n) ⏳ after domain
4. [Domain and DNS](#4-domain-and-dns) ⏳ after domain
5. [Website configuration and deployment](#5-website-configuration-and-deployment)
6. [Final checks](#6-final-checks)

---

## 1. Supabase

1. Create a project at [supabase.com](https://supabase.com). Pick the region closest to your visitors. Note the **project ref**, the part of the project URL in `https://<ref>.supabase.co`.
2. Link and push the database schema from this repo:
   ```bash
   npm install
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push            # applies supabase/migrations/*
   ```
3. Generate the four shared secrets:
   ```bash
   for n in N8N_WEBHOOK_SECRET AUTOMATION_CALLBACK_SECRET DISPATCH_SECRET UNSUBSCRIBE_TOKEN_SECRET; do echo "$n=$(openssl rand -base64 32 | tr -d '=+/')"; done
   ```
   Keep them in a password manager. You'll paste two of them into n8n and one into the cron SQL.
4. Create `supabase/.env.production` (it's gitignored). Copy section **2** of `.env.example` and fill it in. Then run:
   ```bash
   npx supabase secrets set --env-file supabase/.env.production
   npx supabase functions deploy     # deploys all 7 functions (JWT checks off per supabase/config.toml)
   ```
5. Create your SaaS products. Edit `products` in `site.config.mjs`, then:
   ```bash
   npm run products:sql              # prints SQL → paste into Supabase SQL editor → Run
   ```
6. Schedule the retry dispatcher. Open `supabase/setup/schedule-jobs.sql`, replace `<PROJECT_REF>` and `<DISPATCH_SECRET>`, then run the whole file in the SQL editor. Check it's working:
   ```sql
   select * from cron.job_run_details order by start_time desc limit 5;
   ```

> Until n8n is connected, submissions are still saved. Their events wait in `automation_events` with `last_error = 'Awaiting configuration: …'` and go out automatically once n8n is configured.

---

## 2. n8n: import and connect the workflows

Your n8n instance must be reachable over **HTTPS** from Supabase, and must be able to reach `https://<ref>.supabase.co`.

### 2.1 Create the three credentials first

In n8n go to **Overview → Credentials → Create credential**. Use these exact names so the imported nodes find them:

| Name (exact) | Type | Fields |
|---|---|---|
| `Website → n8n (X-Webhook-Secret)` | **Header Auth** | Name: `X-Webhook-Secret` · Value: your `N8N_WEBHOOK_SECRET` |
| `n8n → Supabase (X-Automation-Secret)` | **Header Auth** | Name: `X-Automation-Secret` · Value: your `AUTOMATION_CALLBACK_SECRET` |
| `Hostinger SMTP` | **SMTP** | See [section 3](#3-hostinger-email--smtp-in-n8n). Until then, create it with placeholder values. |

### 2.2 Import the six workflows

For each file in `n8n/workflows/` (A, B, C, D, E, F):

1. In n8n: **Overview → Create → Workflow**, then the **⋯** menu (top right) → **Import from File…** and choose the JSON file.
2. Open each node with a ⚠️ credential warning and select the matching credential from 2.1. Each workflow uses **Webhook**, **Claim event**, **Send email (SMTP)** and **Report SMTP result** (E has a few more HTTP nodes, which all use the Supabase credential).
3. **Save**, then switch the workflow to **Active** (in newer n8n versions, **Publish**).

| File | Webhook path | Triggered by |
|---|---|---|
| `A-newsletter-subscription.json` | `sj-newsletter-subscribe` | new subscription → double opt-in email |
| `B-newsletter-confirmation.json` | `sj-newsletter-confirmed` | confirmed → welcome email |
| `C-saas-waitlist.json` | `sj-waitlist` | waitlist registration → confirmation + notification to you |
| `D-contact-form.json` | `sj-contact` | contact form → notification to you + acknowledgement |
| `E-newsletter-campaigns.json` | `sj-campaign` (+ manual trigger) | campaign sends |
| `F-unsubscribe.json` | `sj-unsubscribe` | unsubscribe processed |

### 2.3 Tell Supabase where n8n is

Set `N8N_BASE_URL=https://your-n8n-host` in `supabase/.env.production`. The production webhook URL of each workflow is then `N8N_BASE_URL/webhook/<path>`. If your n8n uses different URLs, set the individual `N8N_*_WEBHOOK_URL` variables instead. Re-run `npx supabase secrets set --env-file supabase/.env.production`. Secrets apply immediately, with no redeploy needed.

### 2.4 Test the connection

Subscribe on the live site with your own address, then check in the Supabase SQL editor:
```sql
select event_type, status, attempts, last_error from automation_events order by created_at desc limit 5;
select message_type, recipient_email, status, error from email_deliveries order by created_at desc limit 5;
```
`status = completed` + `smtp_accepted` means it worked. You can also see each run under **Executions** in n8n.

### 2.5 Recommended in n8n
- **Settings → Error workflow:** attach an error workflow (an *Error Trigger* node plus an email to yourself) to all six workflows, so a crashed run alerts you. Events whose run never reports back are re-dispatched automatically after 30 minutes anyway.
- Keep n8n updated and behind HTTPS. Never paste secrets into node parameters; keep them in credentials.

---

## 3. Hostinger email + SMTP in n8n
⏳ after domain

1. In Hostinger **hPanel → Emails**, create the mailbox you'll send from (e.g. `hello@yourdomain.com`, which must equal `SENDER_EMAIL`). Also create or choose the mailbox for `NOTIFICATION_EMAIL`.
2. In n8n, edit the **Hostinger SMTP** credential:

   | Field | Value |
   |---|---|
   | User | the full mailbox address, e.g. `hello@yourdomain.com` |
   | Password | the mailbox password |
   | Host | `smtp.hostinger.com` |
   | Port | `465` |
   | SSL/TLS | **on** |

   Alternative: port `587` with **SSL/TLS off**. STARTTLS is then negotiated automatically (leave "Disable STARTTLS" off).
3. The **From** address must be the authenticated mailbox (or an alias of it), otherwise Hostinger rejects the message.
4. Check your Hostinger plan's **sending limits** before large campaigns. Workflow E sends in batches of 25 with a pause between them; adjust `batch_size` and the **Throttle** node to stay under your plan's limit.

**Changing provider later:** only the n8n SMTP credential changes. The website and Supabase are unaffected.

---

## 4. Domain and DNS
⏳ after domain

Hostinger's hPanel shows the exact records for your domain under **Emails → (domain) → DNS / Connect domain**. Use those values. Typically:

| Record | Host | Value | Purpose |
|---|---|---|---|
| MX | `@` | `mx1.hostinger.com` (priority 5), `mx2.hostinger.com` (priority 10) | receive email |
| TXT | `@` | `v=spf1 include:_spf.mail.hostinger.com ~all` | SPF: authorises Hostinger to send |
| CNAME/TXT | as shown in hPanel | DKIM records from hPanel | DKIM signing |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:you@yourdomain.com` | DMARC: start with `p=none`, tighten to `quarantine` once reports look clean |
| A / CNAME | `@`, `www` | from your website host | the website |

Only one SPF record may exist. If you add another sender later, merge it into the same record. Test with [mail-tester.com](https://www.mail-tester.com) after setup and aim for 9–10/10. SPF, DKIM and DMARC are what keep confirmation emails out of spam.

---

## 5. Website configuration and deployment

1. Edit **`site.config.mjs`**: your domain, contact email, social URLs, venture links, product name and description. Anything left empty is hidden. Or set the equivalent variables (section 1 of `.env.example`) in your hosting dashboard.
2. Build: `npm run build` creates `dist/`. The build prints notes about anything still unconfigured.
3. Deploy `dist/`. Any static host works:
   - **Cloudflare Pages / Netlify** (recommended): connect the GitHub repo, build command `npm run build`, output directory `dist`, add the section-1 variables. Security headers come from the generated `dist/_headers`.
   - **Hostinger web hosting:** run `npm run build` locally and upload the *contents* of `dist/` (including the hidden `.htaccess`) to `public_html`. Enable the free SSL certificate in hPanel.
4. Make sure `ALLOWED_ORIGINS` (Supabase secret) contains the exact site origin(s), e.g. `https://yourdomain.com,https://www.yourdomain.com`. Otherwise the forms are refused.
5. After changing the headline or name, regenerate the share image and icons with `node scripts/render-images.mjs` (requires `npx playwright install chromium`).

---

## 6. Final checks

- [ ] Subscribe → confirmation email arrives → link confirms → welcome email arrives.
- [ ] The unsubscribe link in the welcome email works.
- [ ] Waitlist form → confirmation + your notification arrive.
- [ ] Contact form → your notification (reply-to = sender) + acknowledgement arrive.
- [ ] `select * from automation_events where status in ('failed','dead')` is empty.
- [ ] Submit [your URL to Google Search Console](https://search.google.com/search-console) along with `/sitemap.xml`.
- [ ] Check the share preview (e.g. paste the URL into a LinkedIn post draft).
- [ ] Have the privacy policy and terms reviewed, then remove the "Draft for review" notes in `src/pages/secondary.mjs`.
