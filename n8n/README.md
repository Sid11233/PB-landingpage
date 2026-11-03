# n8n workflows

Six importable workflows (A–F). Import instructions: [docs/SETUP.md §2](../docs/SETUP.md#2-n8n-import-and-connect-the-workflows).

They contain **no credentials**, only references to three credentials you create in n8n by name:
`Hostinger SMTP`, `Website → n8n (X-Webhook-Secret)`, `n8n → Supabase (X-Automation-Secret)`.

The emails are rendered by the backend (`supabase/functions/_shared/emails/`), so the workflows stay small: receive → claim (dedupe) → send via SMTP → report the result. To change email wording, edit the templates and redeploy the functions. To change provider, change only the SMTP credential.
