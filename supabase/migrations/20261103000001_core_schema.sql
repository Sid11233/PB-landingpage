-- =============================================================================
-- Core schema: newsletter, SaaS waiting lists, contact form, automation outbox,
-- email delivery tracking, campaigns, rate limiting and future admin access.
--
-- Security model
--   * Row Level Security is enabled on every table.
--   * The public (anon) role has NO table or function access at all.
--   * All writes come from Supabase Edge Functions using the service role,
--     through the SECURITY DEFINER functions below (transactional outbox).
--   * Signed-in users listed in public.admin_users get read access (and a few
--     narrow updates) for a future private admin dashboard.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
create type public.subscriber_status as enum ('pending', 'active', 'unsubscribed', 'bounced', 'suppressed');
create type public.event_status as enum ('pending', 'dispatching', 'dispatched', 'processing', 'completed', 'failed', 'dead', 'skipped');
-- pending       saved, not yet handed to n8n
-- dispatched    n8n webhook accepted the event (NOT proof of sending)
-- smtp_accepted the SMTP server accepted the message (NOT proof of inbox delivery)
-- delivered     reserved: positive delivery confirmation, if a provider ever supplies one
-- failed        sending failed (see error); bounced: a bounce was reported later
create type public.email_status as enum ('pending', 'dispatched', 'smtp_accepted', 'delivered', 'failed', 'bounced', 'skipped');
create type public.product_status as enum ('draft', 'waitlist_open', 'waitlist_closed', 'beta', 'launched', 'archived');
create type public.registration_status as enum ('waiting', 'invited_early_access', 'invited_beta', 'converted', 'removed');
create type public.contact_status as enum ('new', 'in_progress', 'replied', 'closed', 'spam');
create type public.campaign_status as enum ('draft', 'sending', 'sent', 'cancelled');
create type public.recipient_status as enum ('queued', 'sending', 'smtp_accepted', 'failed', 'skipped', 'bounced');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Newsletter
-- ---------------------------------------------------------------------------
create table public.newsletter_subscribers (
  id                              uuid primary key default gen_random_uuid(),
  email                           text not null,
  first_name                      text,
  status                          public.subscriber_status not null default 'pending',
  source                          text not null default 'website',
  tags                            text[] not null default '{}',
  consent_text                    text,
  consent_at                      timestamptz,
  confirmed_at                    timestamptz,
  unsubscribed_at                 timestamptz,
  unsubscribe_reason              text,
  last_confirmation_requested_at  timestamptz,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  constraint newsletter_subscribers_email_key unique (email),
  constraint newsletter_subscribers_email_lower check (email = lower(btrim(email))),
  constraint newsletter_subscribers_email_len check (char_length(email) between 3 and 254),
  constraint newsletter_subscribers_first_name_len check (first_name is null or char_length(first_name) <= 80)
);
create index newsletter_subscribers_status_idx on public.newsletter_subscribers (status);
create index newsletter_subscribers_tags_idx on public.newsletter_subscribers using gin (tags);
create trigger newsletter_subscribers_updated_at before update on public.newsletter_subscribers
  for each row execute function public.set_updated_at();

-- Only SHA-256 hashes of confirmation tokens are stored. The plaintext token
-- exists only in memory while the confirmation email is being dispatched.
create table public.newsletter_tokens (
  id             uuid primary key default gen_random_uuid(),
  subscriber_id  uuid not null references public.newsletter_subscribers (id) on delete cascade,
  purpose        text not null default 'confirm' check (purpose in ('confirm')),
  token_hash     text not null unique,
  expires_at     timestamptz not null,
  used_at        timestamptz,
  created_at     timestamptz not null default now()
);
create index newsletter_tokens_subscriber_idx on public.newsletter_tokens (subscriber_id);

-- ---------------------------------------------------------------------------
-- SaaS products and waiting lists
-- ---------------------------------------------------------------------------
create table public.saas_products (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name         text not null check (char_length(name) <= 120),
  description  text check (description is null or char_length(description) <= 1000),
  status       public.product_status not null default 'draft',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger saas_products_updated_at before update on public.saas_products
  for each row execute function public.set_updated_at();

create table public.waitlist_registrations (
  id                          uuid primary key default gen_random_uuid(),
  product_id                  uuid not null references public.saas_products (id) on delete restrict,
  first_name                  text not null check (char_length(first_name) between 1 and 80),
  email                       text not null check (email = lower(btrim(email)) and char_length(email) between 3 and 254),
  company_name                text check (company_name is null or char_length(company_name) <= 160),
  additional_info             text check (additional_info is null or char_length(additional_info) <= 2000),
  status                      public.registration_status not null default 'waiting',
  source                      text not null default 'website',
  confirmation_email_status   public.email_status not null default 'pending',
  notification_email_status   public.email_status not null default 'pending',
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  -- Same person may join several products, but only once per product.
  constraint waitlist_registrations_product_email_key unique (product_id, email)
);
create index waitlist_registrations_email_idx on public.waitlist_registrations (email);
create index waitlist_registrations_product_status_idx on public.waitlist_registrations (product_id, status);
create trigger waitlist_registrations_updated_at before update on public.waitlist_registrations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Contact form
-- ---------------------------------------------------------------------------
create table public.contact_submissions (
  id                       uuid primary key default gen_random_uuid(),
  full_name                text not null check (char_length(full_name) between 1 and 120),
  email                    text not null check (email = lower(btrim(email)) and char_length(email) between 3 and 254),
  category                 text not null check (category in ('business', 'collaboration', 'saas', 'technology', 'general', 'other')),
  subject                  text not null check (char_length(subject) between 1 and 200),
  message                  text not null check (char_length(message) between 1 and 5000),
  status                   public.contact_status not null default 'new',
  notification_status      public.email_status not null default 'pending',
  acknowledgement_status   public.email_status not null default 'pending',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index contact_submissions_status_idx on public.contact_submissions (status, created_at desc);
create index contact_submissions_email_idx on public.contact_submissions (email);
create trigger contact_submissions_updated_at before update on public.contact_submissions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Automation outbox
-- ---------------------------------------------------------------------------
create table public.automation_events (
  id                     uuid primary key default gen_random_uuid(),
  event_type             text not null,
  aggregate_type         text not null,
  aggregate_id           uuid,
  idempotency_key        text not null unique,
  payload                jsonb not null default '{}',
  status                 public.event_status not null default 'pending',
  attempts               integer not null default 0,
  max_attempts           integer not null default 8,
  next_attempt_at        timestamptz not null default now(),
  locked_at              timestamptz,
  expected_messages      text[] not null default '{}',
  dispatched_at          timestamptz,
  processing_started_at  timestamptz,
  completed_at           timestamptz,
  last_http_status       integer,
  last_error             text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index automation_events_due_idx on public.automation_events (next_attempt_at)
  where status in ('pending', 'failed');
create index automation_events_stale_idx on public.automation_events (updated_at)
  where status in ('dispatching', 'dispatched', 'processing');
create index automation_events_aggregate_idx on public.automation_events (aggregate_type, aggregate_id);
create trigger automation_events_updated_at before update on public.automation_events
  for each row execute function public.set_updated_at();

-- One row per (event, message type): e.g. the contact notification and the
-- sender acknowledgement are tracked separately.
create table public.email_deliveries (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.automation_events (id) on delete cascade,
  message_type     text not null,
  recipient_email  text not null,
  status           public.email_status not null default 'pending',
  smtp_message_id  text,
  smtp_response    text,
  error            text,
  attempts         integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint email_deliveries_event_message_key unique (event_id, message_type)
);
create index email_deliveries_status_idx on public.email_deliveries (status, created_at desc);
create index email_deliveries_recipient_idx on public.email_deliveries (recipient_email);
create trigger email_deliveries_updated_at before update on public.email_deliveries
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Newsletter campaigns
-- ---------------------------------------------------------------------------
create table public.newsletter_campaigns (
  id             uuid primary key default gen_random_uuid(),
  identifier     text not null unique check (identifier ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  subject        text not null check (char_length(subject) <= 200),
  preheader      text,
  -- Body content. Merge fields: {{first_name}}, {{first_name_or_there}}, {{email}}.
  -- The branded layout and unsubscribe footer are added automatically.
  html_body      text not null,
  text_body      text not null,
  -- Segmentation, e.g. {"tags_any": ["founders"], "sources_any": ["website"]}.
  -- An empty object means every active subscriber.
  segment        jsonb not null default '{}',
  status         public.campaign_status not null default 'draft',
  started_at     timestamptz,
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger newsletter_campaigns_updated_at before update on public.newsletter_campaigns
  for each row execute function public.set_updated_at();

create table public.campaign_recipients (
  id               uuid primary key default gen_random_uuid(),
  campaign_id      uuid not null references public.newsletter_campaigns (id) on delete cascade,
  subscriber_id    uuid references public.newsletter_subscribers (id) on delete set null,
  email            text not null,
  status           public.recipient_status not null default 'queued',
  smtp_message_id  text,
  error            text,
  locked_at        timestamptz,
  sent_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint campaign_recipients_campaign_subscriber_key unique (campaign_id, subscriber_id)
);
create index campaign_recipients_campaign_status_idx on public.campaign_recipients (campaign_id, status);
create trigger campaign_recipients_updated_at before update on public.campaign_recipients
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Rate limiting (fixed window, keyed by a salted hash of the client IP)
-- ---------------------------------------------------------------------------
create table public.rate_limits (
  key           text not null,
  window_start  timestamptz not null,
  hits          integer not null default 0,
  primary key (key, window_start)
);

-- ---------------------------------------------------------------------------
-- Future admin dashboard: add your auth user id here to grant read access.
-- ---------------------------------------------------------------------------
create table public.admin_users (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admin_users where user_id = (select auth.uid()));
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security: on everywhere. No anon policies exist, so public
-- visitors can never read or write any row directly.
-- ---------------------------------------------------------------------------
alter table public.newsletter_subscribers enable row level security;
alter table public.newsletter_tokens      enable row level security;
alter table public.saas_products          enable row level security;
alter table public.waitlist_registrations enable row level security;
alter table public.contact_submissions    enable row level security;
alter table public.automation_events      enable row level security;
alter table public.email_deliveries       enable row level security;
alter table public.newsletter_campaigns   enable row level security;
alter table public.campaign_recipients    enable row level security;
alter table public.rate_limits            enable row level security;
alter table public.admin_users            enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant select on public.newsletter_subscribers, public.saas_products, public.waitlist_registrations,
  public.contact_submissions, public.automation_events, public.email_deliveries,
  public.newsletter_campaigns, public.campaign_recipients to authenticated;
grant update (status) on public.contact_submissions to authenticated;
grant update (status) on public.waitlist_registrations to authenticated;

create policy admin_read on public.newsletter_subscribers for select to authenticated using ((select public.is_admin()));
create policy admin_read on public.saas_products          for select to authenticated using ((select public.is_admin()));
create policy admin_read on public.waitlist_registrations for select to authenticated using ((select public.is_admin()));
create policy admin_read on public.contact_submissions    for select to authenticated using ((select public.is_admin()));
create policy admin_read on public.automation_events      for select to authenticated using ((select public.is_admin()));
create policy admin_read on public.email_deliveries       for select to authenticated using ((select public.is_admin()));
create policy admin_read on public.newsletter_campaigns   for select to authenticated using ((select public.is_admin()));
create policy admin_read on public.campaign_recipients    for select to authenticated using ((select public.is_admin()));
create policy admin_update_status on public.contact_submissions    for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy admin_update_status on public.waitlist_registrations for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- Stop future tables/functions from being exposed to anon by default.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
