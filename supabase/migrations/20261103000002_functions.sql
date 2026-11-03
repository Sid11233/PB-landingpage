-- =============================================================================
-- Business logic as SECURITY DEFINER functions. Each public action writes its
-- record AND its outbox event in one transaction, so an event can never be
-- lost even if n8n (or the edge function) dies right after the write.
-- Only the service role may execute these (see grants at the bottom).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Outbox: enqueue (idempotent on idempotency_key)
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_event(
  p_event_type text, p_aggregate_type text, p_aggregate_id uuid,
  p_idempotency_key text, p_payload jsonb default '{}'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.automation_events (event_type, aggregate_type, aggregate_id, idempotency_key, payload)
  values (p_event_type, p_aggregate_type, p_aggregate_id, p_idempotency_key, coalesce(p_payload, '{}'))
  on conflict (idempotency_key) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.automation_events where idempotency_key = p_idempotency_key;
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Rate limit: returns true when the request is allowed.
-- ---------------------------------------------------------------------------
create or replace function public.check_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into public.rate_limits (key, window_start, hits) values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = public.rate_limits.hits + 1
  returning hits into v_hits;
  return v_hits <= p_limit;
end $$;

-- ---------------------------------------------------------------------------
-- Newsletter: subscribe (double opt-in)
-- Returns {action, subscriber_id, event_id}
--   created | resent | cooldown | resubscribed | already_active | suppressed
-- ---------------------------------------------------------------------------
create or replace function public.newsletter_subscribe(
  p_email text, p_first_name text, p_source text, p_consent_text text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(p_email));
  v_sub public.newsletter_subscribers;
  v_action text;
  v_event uuid;
begin
  insert into public.newsletter_subscribers (email, first_name, source, consent_text, consent_at)
  values (v_email, nullif(btrim(p_first_name), ''), coalesce(p_source, 'website'), p_consent_text, now())
  on conflict (email) do nothing
  returning * into v_sub;

  if v_sub.id is not null then
    v_action := 'created';
  else
    select * into v_sub from public.newsletter_subscribers where email = v_email for update;
    if v_sub.status = 'active' then
      return jsonb_build_object('action', 'already_active', 'subscriber_id', v_sub.id);
    elsif v_sub.status in ('bounced', 'suppressed') then
      return jsonb_build_object('action', 'suppressed', 'subscriber_id', v_sub.id);
    elsif v_sub.status = 'pending' then
      if v_sub.last_confirmation_requested_at > now() - interval '5 minutes' then
        return jsonb_build_object('action', 'cooldown', 'subscriber_id', v_sub.id);
      end if;
      v_action := 'resent';
    else -- unsubscribed -> fresh explicit consent, back to pending
      v_action := 'resubscribed';
    end if;
    update public.newsletter_subscribers set
      status = 'pending',
      first_name = coalesce(nullif(btrim(p_first_name), ''), first_name),
      consent_text = p_consent_text,
      consent_at = now(),
      confirmed_at = case when v_action = 'resubscribed' then null else confirmed_at end,
      source = case when v_action = 'resubscribed' then coalesce(p_source, source) else source end
    where id = v_sub.id;
  end if;

  update public.newsletter_subscribers set last_confirmation_requested_at = now() where id = v_sub.id;
  v_event := public.enqueue_event(
    'newsletter.confirmation_requested', 'newsletter_subscriber', v_sub.id,
    'newsletter.confirmation_requested:' || v_sub.id || ':' || extract(epoch from clock_timestamp())::text,
    jsonb_build_object('subscriber_id', v_sub.id));
  return jsonb_build_object('action', v_action, 'subscriber_id', v_sub.id, 'event_id', v_event);
end $$;

-- ---------------------------------------------------------------------------
-- Newsletter: confirm a token (by SHA-256 hash)
-- Returns {result: confirmed | already_confirmed | expired | invalid, ...}
-- ---------------------------------------------------------------------------
create or replace function public.newsletter_confirm(p_token_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_tok public.newsletter_tokens;
  v_sub public.newsletter_subscribers;
  v_event uuid;
begin
  select * into v_tok from public.newsletter_tokens
   where token_hash = p_token_hash and purpose = 'confirm' for update;
  if v_tok.id is null then
    return jsonb_build_object('result', 'invalid');
  end if;
  select * into v_sub from public.newsletter_subscribers where id = v_tok.subscriber_id for update;

  if v_tok.used_at is not null then
    return jsonb_build_object('result', case when v_sub.status = 'active' then 'already_confirmed' else 'invalid' end);
  end if;
  if v_sub.status = 'active' then
    update public.newsletter_tokens set used_at = now() where id = v_tok.id;
    return jsonb_build_object('result', 'already_confirmed');
  end if;
  if v_tok.expires_at < now() then
    return jsonb_build_object('result', 'expired');
  end if;
  if v_sub.status <> 'pending' then
    -- e.g. unsubscribed or suppressed after the link was sent
    return jsonb_build_object('result', 'invalid');
  end if;

  update public.newsletter_subscribers set status = 'active', confirmed_at = now() where id = v_sub.id;
  -- Single use: burn this token and every other outstanding confirm token.
  update public.newsletter_tokens set used_at = now()
   where subscriber_id = v_sub.id and purpose = 'confirm' and used_at is null;

  v_event := public.enqueue_event(
    'newsletter.confirmed', 'newsletter_subscriber', v_sub.id,
    'newsletter.confirmed:' || v_sub.id || ':' || extract(epoch from clock_timestamp())::text,
    jsonb_build_object('subscriber_id', v_sub.id));
  return jsonb_build_object('result', 'confirmed', 'subscriber_id', v_sub.id, 'event_id', v_event);
end $$;

-- ---------------------------------------------------------------------------
-- Newsletter: unsubscribe
-- ---------------------------------------------------------------------------
create or replace function public.newsletter_unsubscribe(p_subscriber_id uuid, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_sub public.newsletter_subscribers;
  v_event uuid;
begin
  select * into v_sub from public.newsletter_subscribers where id = p_subscriber_id for update;
  if v_sub.id is null then
    return jsonb_build_object('result', 'not_found');
  end if;
  if v_sub.status = 'unsubscribed' then
    return jsonb_build_object('result', 'already_unsubscribed');
  end if;

  update public.newsletter_subscribers
     set status = case when status in ('bounced', 'suppressed') then status else 'unsubscribed' end,
         unsubscribed_at = now(),
         unsubscribe_reason = left(p_reason, 500)
   where id = v_sub.id;
  -- Outstanding confirmation links stop working.
  update public.newsletter_tokens set used_at = now() where subscriber_id = v_sub.id and used_at is null;
  -- Anything still queued in a running campaign is skipped.
  update public.campaign_recipients set status = 'skipped', error = 'unsubscribed'
   where subscriber_id = v_sub.id and status in ('queued', 'sending');

  v_event := public.enqueue_event(
    'newsletter.unsubscribed', 'newsletter_subscriber', v_sub.id,
    'newsletter.unsubscribed:' || v_sub.id || ':' || extract(epoch from clock_timestamp())::text,
    jsonb_build_object('subscriber_id', v_sub.id));
  return jsonb_build_object('result', 'unsubscribed', 'subscriber_id', v_sub.id, 'event_id', v_event);
end $$;

-- ---------------------------------------------------------------------------
-- Waiting list
-- Returns {action: created | duplicate | product_unavailable, ...}
-- ---------------------------------------------------------------------------
create or replace function public.waitlist_register(
  p_product_slug text, p_first_name text, p_email text,
  p_company_name text, p_additional_info text, p_source text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_product public.saas_products;
  v_id uuid;
  v_event uuid;
  v_email text := lower(btrim(p_email));
begin
  select * into v_product from public.saas_products where slug = p_product_slug;
  if v_product.id is null or v_product.status not in ('waitlist_open', 'beta') then
    return jsonb_build_object('action', 'product_unavailable');
  end if;

  insert into public.waitlist_registrations (product_id, first_name, email, company_name, additional_info, source)
  values (v_product.id, btrim(p_first_name), v_email, nullif(btrim(p_company_name), ''),
          nullif(btrim(p_additional_info), ''), coalesce(p_source, 'website'))
  on conflict (product_id, email) do nothing
  returning id into v_id;

  if v_id is null then
    -- Someone who left the list may rejoin.
    update public.waitlist_registrations
       set status = 'waiting', first_name = btrim(p_first_name),
           confirmation_email_status = 'pending', notification_email_status = 'pending'
     where product_id = v_product.id and email = v_email and status = 'removed'
    returning id into v_id;
    if v_id is null then
      return jsonb_build_object('action', 'duplicate', 'product_name', v_product.name);
    end if;
  end if;

  v_event := public.enqueue_event(
    'waitlist.registered', 'waitlist_registration', v_id,
    'waitlist.registered:' || v_id || ':' || extract(epoch from clock_timestamp())::text,
    jsonb_build_object('registration_id', v_id, 'product_id', v_product.id, 'product_slug', v_product.slug));
  return jsonb_build_object('action', 'created', 'registration_id', v_id, 'event_id', v_event,
                            'product_name', v_product.name);
end $$;

create or replace function public.waitlist_leave(p_registration_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_status public.registration_status;
begin
  select status into v_status from public.waitlist_registrations where id = p_registration_id for update;
  if v_status is null then return jsonb_build_object('result', 'not_found'); end if;
  if v_status = 'removed' then return jsonb_build_object('result', 'already_unsubscribed'); end if;
  update public.waitlist_registrations set status = 'removed' where id = p_registration_id;
  return jsonb_build_object('result', 'unsubscribed');
end $$;

-- ---------------------------------------------------------------------------
-- Contact form
-- ---------------------------------------------------------------------------
create or replace function public.contact_submit(
  p_full_name text, p_email text, p_category text, p_subject text, p_message text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_event uuid;
begin
  insert into public.contact_submissions (full_name, email, category, subject, message)
  values (btrim(p_full_name), lower(btrim(p_email)), p_category, btrim(p_subject), btrim(p_message))
  returning id into v_id;
  v_event := public.enqueue_event('contact.submitted', 'contact_submission', v_id,
    'contact.submitted:' || v_id, jsonb_build_object('submission_id', v_id));
  return jsonb_build_object('submission_id', v_id, 'event_id', v_event);
end $$;

-- ---------------------------------------------------------------------------
-- Dispatcher: atomically claim due events (or one specific event).
-- Also recovers events stuck mid-flight for more than 30 minutes.
-- ---------------------------------------------------------------------------
create or replace function public.claim_automation_events(p_limit integer default 20, p_event_id uuid default null)
returns setof public.automation_events
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with due as (
    select e.id from public.automation_events e
     where (p_event_id is null or e.id = p_event_id)
       and e.attempts < e.max_attempts
       and (
         (e.status in ('pending', 'failed') and e.next_attempt_at <= now())
         or (e.status in ('dispatching', 'dispatched', 'processing') and e.updated_at < now() - interval '30 minutes')
       )
     order by e.next_attempt_at
     limit p_limit
     for update skip locked
  )
  update public.automation_events e
     set status = 'dispatching', locked_at = now(), attempts = e.attempts + 1, processing_started_at = null
    from due where e.id = due.id
  returning e.*;
end $$;

-- Releases a claimed event without spending an attempt (e.g. webhook URL not configured yet).
create or replace function public.release_automation_event(p_event_id uuid, p_reason text, p_retry_seconds integer default 900)
returns void
language sql security definer set search_path = '' as $$
  update public.automation_events
     set status = 'pending', attempts = greatest(attempts - 1, 0), locked_at = null,
         next_attempt_at = now() + make_interval(secs => p_retry_seconds), last_error = p_reason
   where id = p_event_id and status = 'dispatching';
$$;

-- Records the outcome of an HTTP dispatch attempt.
create or replace function public.record_dispatch_result(
  p_event_id uuid, p_ok boolean, p_http_status integer, p_error text
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_e public.automation_events;
begin
  select * into v_e from public.automation_events where id = p_event_id for update;
  if p_ok then
    update public.automation_events
       set status = 'dispatched', dispatched_at = now(), last_http_status = p_http_status, last_error = null
     where id = p_event_id and status = 'dispatching';
    update public.email_deliveries set status = 'dispatched'
     where event_id = p_event_id and status = 'pending';
  else
    -- Only downgrade if n8n has not already claimed it in the meantime.
    if v_e.status = 'dispatching' then
      if v_e.attempts >= v_e.max_attempts then
        update public.automation_events
           set status = 'dead', last_http_status = p_http_status, last_error = left(p_error, 2000)
         where id = p_event_id;
        update public.email_deliveries
           set status = 'failed', error = 'Automation dispatch failed after all retries: ' || left(p_error, 500)
         where event_id = p_event_id and status in ('pending', 'dispatched');
      else
        update public.automation_events
           set status = 'failed', last_http_status = p_http_status, last_error = left(p_error, 2000),
               -- exponential backoff: 1, 2, 4, 8 ... minutes, capped at 3 hours
               next_attempt_at = now() + least(interval '3 hours', interval '1 minute' * power(2, greatest(v_e.attempts - 1, 0)))
         where id = p_event_id;
      end if;
    end if;
  end if;
  perform public.sync_source_statuses(p_event_id);
end $$;

-- Marks an event as not needing any action (e.g. subscriber unsubscribed before
-- their welcome email was dispatched).
create or replace function public.skip_automation_event(p_event_id uuid, p_reason text) returns void
language sql security definer set search_path = '' as $$
  update public.automation_events set status = 'skipped', last_error = p_reason, completed_at = now()
   where id = p_event_id;
  update public.email_deliveries set status = 'skipped', error = p_reason
   where event_id = p_event_id and status in ('pending', 'dispatched');
$$;

-- ---------------------------------------------------------------------------
-- n8n -> backend: claim an event for processing (consumer-side idempotency).
-- Returns {proceed, already_sent[]}. A second delivery of the same webhook
-- (retry, replay, double-click in n8n) gets proceed=false.
-- ---------------------------------------------------------------------------
create or replace function public.claim_event_processing(p_event_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_e public.automation_events; v_sent text[];
begin
  update public.automation_events
     set status = 'processing', processing_started_at = now()
   where id = p_event_id and status in ('dispatching', 'dispatched')
  returning * into v_e;
  if v_e.id is null then
    return jsonb_build_object('proceed', false, 'reason', 'not claimable (already processed, in progress, or unknown)');
  end if;

  select coalesce(array_agg(message_type), '{}') into v_sent
    from public.email_deliveries where event_id = p_event_id and status in ('smtp_accepted', 'delivered', 'skipped');

  if cardinality(v_e.expected_messages) = 0 or v_e.expected_messages <@ v_sent then
    update public.automation_events set status = 'completed', completed_at = now() where id = p_event_id;
  end if;
  return jsonb_build_object('proceed', true, 'event_type', v_e.event_type, 'already_sent', to_jsonb(v_sent));
end $$;

-- ---------------------------------------------------------------------------
-- n8n -> backend: report the SMTP result of one message, then recompute the
-- event state. Failure schedules a retry that resends only unsent messages.
-- ---------------------------------------------------------------------------
create or replace function public.record_email_result(
  p_event_id uuid, p_message_type text, p_status public.email_status,
  p_smtp_message_id text default null, p_smtp_response text default null, p_error text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_e public.automation_events;
  v_sent text[];
  v_failed boolean;
begin
  if p_status not in ('smtp_accepted', 'failed', 'delivered', 'bounced') then
    raise exception 'invalid status %', p_status;
  end if;
  select * into v_e from public.automation_events where id = p_event_id for update;
  if v_e.id is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown event');
  end if;

  update public.email_deliveries
     set status = p_status,
         smtp_message_id = coalesce(p_smtp_message_id, smtp_message_id),
         smtp_response = left(coalesce(p_smtp_response, smtp_response), 1000),
         error = case when p_status = 'failed' then left(p_error, 2000) else null end,
         attempts = attempts + 1
   where event_id = p_event_id and message_type = p_message_type
     -- a late failure report must never overwrite a success
     and not (p_status = 'failed' and status in ('smtp_accepted', 'delivered'));

  select coalesce(array_agg(message_type) filter (where status in ('smtp_accepted', 'delivered', 'skipped')), '{}'),
         coalesce(bool_or(status = 'failed'), false)
    into v_sent, v_failed
    from public.email_deliveries where event_id = p_event_id;

  if v_e.expected_messages <@ v_sent then
    update public.automation_events set status = 'completed', completed_at = now(), last_error = null
     where id = p_event_id;
  elsif v_failed and v_e.status = 'processing' then
    if v_e.attempts >= v_e.max_attempts then
      update public.automation_events set status = 'dead', last_error = left(p_error, 2000) where id = p_event_id;
    else
      update public.automation_events
         set status = 'failed', processing_started_at = null, last_error = left(p_error, 2000),
             next_attempt_at = now() + least(interval '3 hours', interval '2 minutes' * power(2, greatest(v_e.attempts - 1, 0)))
       where id = p_event_id;
    end if;
  end if;

  perform public.sync_source_statuses(p_event_id);
  return jsonb_build_object('ok', true);
end $$;

-- Copies per-message delivery state onto the source record columns
-- (waitlist_registrations / contact_submissions) for easy querying.
create or replace function public.sync_source_statuses(p_event_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_e public.automation_events; r record;
begin
  select * into v_e from public.automation_events where id = p_event_id;
  for r in select message_type, status from public.email_deliveries where event_id = p_event_id loop
    if r.message_type = 'waitlist_confirmation' then
      update public.waitlist_registrations set confirmation_email_status = r.status where id = v_e.aggregate_id;
    elsif r.message_type = 'waitlist_notification' then
      update public.waitlist_registrations set notification_email_status = r.status where id = v_e.aggregate_id;
    elsif r.message_type = 'contact_notification' then
      update public.contact_submissions set notification_status = r.status where id = v_e.aggregate_id;
    elsif r.message_type = 'contact_acknowledgement' then
      update public.contact_submissions set acknowledgement_status = r.status where id = v_e.aggregate_id;
    end if;
  end loop;
end $$;

-- Bounce / complaint handling hook (e.g. a future n8n IMAP bounce-mailbox workflow).
create or replace function public.mark_email_bounced(p_email text, p_reason text default 'bounced') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  update public.newsletter_subscribers set status = 'bounced', unsubscribe_reason = left(p_reason, 500)
   where email = lower(btrim(p_email)) and status in ('pending', 'active');
  get diagnostics v_count = row_count;
  update public.campaign_recipients set status = 'skipped', error = 'bounced'
   where email = lower(btrim(p_email)) and status in ('queued', 'sending');
  return jsonb_build_object('subscribers_updated', v_count);
end $$;

-- ---------------------------------------------------------------------------
-- Campaigns
-- ---------------------------------------------------------------------------
-- Owner-only helper (run from the SQL editor or a future admin API):
--   select public.request_campaign_send('my-campaign-identifier');
create or replace function public.request_campaign_send(p_identifier text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_c public.newsletter_campaigns;
begin
  select * into v_c from public.newsletter_campaigns where identifier = p_identifier;
  if v_c.id is null then raise exception 'campaign % not found', p_identifier; end if;
  if v_c.status not in ('draft', 'sending') then raise exception 'campaign % is %', p_identifier, v_c.status; end if;
  return public.enqueue_event('campaign.send_requested', 'newsletter_campaign', v_c.id,
    'campaign.send_requested:' || v_c.id || ':' || extract(epoch from clock_timestamp())::text,
    jsonb_build_object('campaign_id', v_c.id, 'identifier', v_c.identifier));
end $$;

-- Snapshots the audience: ACTIVE subscribers only, filtered by segment.
-- Idempotent: running it again never adds duplicates.
create or replace function public.campaign_start(p_identifier text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_c public.newsletter_campaigns;
  v_tags text[];
  v_sources text[];
  v_added integer;
begin
  select * into v_c from public.newsletter_campaigns where identifier = p_identifier for update;
  if v_c.id is null then return jsonb_build_object('ok', false, 'reason', 'campaign not found'); end if;
  if v_c.status not in ('draft', 'sending') then
    return jsonb_build_object('ok', false, 'reason', 'campaign status is ' || v_c.status);
  end if;

  select coalesce(array_agg(x), '{}') into v_tags from jsonb_array_elements_text(coalesce(v_c.segment -> 'tags_any', '[]')) x;
  select coalesce(array_agg(x), '{}') into v_sources from jsonb_array_elements_text(coalesce(v_c.segment -> 'sources_any', '[]')) x;

  insert into public.campaign_recipients (campaign_id, subscriber_id, email)
  select v_c.id, s.id, s.email from public.newsletter_subscribers s
   where s.status = 'active'
     and (cardinality(v_tags) = 0 or s.tags && v_tags)
     and (cardinality(v_sources) = 0 or s.source = any (v_sources))
  on conflict (campaign_id, subscriber_id) do nothing;
  get diagnostics v_added = row_count;

  update public.newsletter_campaigns set status = 'sending', started_at = coalesce(started_at, now()) where id = v_c.id;
  return jsonb_build_object('ok', true, 'campaign_id', v_c.id, 'added', v_added,
    'queued', (select count(*) from public.campaign_recipients where campaign_id = v_c.id and status = 'queued'));
end $$;

-- Locks the next batch. Re-checks each subscriber is still ACTIVE right before sending.
create or replace function public.campaign_next_batch(p_campaign_id uuid, p_limit integer default 50)
returns table (recipient_id uuid, subscriber_id uuid, email text, first_name text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  update public.campaign_recipients r set status = 'skipped', error = 'subscriber no longer active'
    from public.newsletter_subscribers s
   where r.campaign_id = p_campaign_id and r.status in ('queued', 'sending')
     and s.id = r.subscriber_id and s.status <> 'active';
  update public.campaign_recipients set status = 'skipped', error = 'subscriber deleted'
   where campaign_id = p_campaign_id and status in ('queued', 'sending') and subscriber_id is null;
  -- recover rows locked by a crashed run
  update public.campaign_recipients set status = 'queued', locked_at = null
   where campaign_id = p_campaign_id and status = 'sending' and locked_at < now() - interval '15 minutes';

  return query
  with batch as (
    select r.id from public.campaign_recipients r
     where r.campaign_id = p_campaign_id and r.status = 'queued'
     order by r.created_at limit p_limit for update skip locked
  ), locked as (
    update public.campaign_recipients r set status = 'sending', locked_at = now()
      from batch where r.id = batch.id
    returning r.id, r.subscriber_id
  )
  select l.id, l.subscriber_id, s.email, s.first_name
    from locked l join public.newsletter_subscribers s on s.id = l.subscriber_id;
end $$;

create or replace function public.campaign_record_result(
  p_recipient_id uuid, p_status public.recipient_status, p_smtp_message_id text default null, p_error text default null
) returns void
language sql security definer set search_path = '' as $$
  update public.campaign_recipients
     set status = p_status, smtp_message_id = p_smtp_message_id, error = left(p_error, 2000),
         sent_at = case when p_status = 'smtp_accepted' then now() else sent_at end, locked_at = null
   where id = p_recipient_id and status = 'sending';
$$;

create or replace function public.campaign_complete(p_campaign_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_open integer; v_stats jsonb;
begin
  select count(*) into v_open from public.campaign_recipients
   where campaign_id = p_campaign_id and status in ('queued', 'sending');
  select jsonb_object_agg(status, n) into v_stats from (
    select status, count(*) n from public.campaign_recipients where campaign_id = p_campaign_id group by status) t;
  if v_open = 0 then
    update public.newsletter_campaigns set status = 'sent', completed_at = now()
     where id = p_campaign_id and status = 'sending';
  end if;
  return jsonb_build_object('complete', v_open = 0, 'stats', coalesce(v_stats, '{}'));
end $$;

-- ---------------------------------------------------------------------------
-- Data subject requests (run by the site owner from the SQL editor)
--   select public.export_personal_data('person@example.com');
--   select public.delete_personal_data('person@example.com');
-- ---------------------------------------------------------------------------
create or replace function public.export_personal_data(p_email text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'email', lower(btrim(p_email)),
    'newsletter', (select to_jsonb(s) - 'id' from public.newsletter_subscribers s where s.email = lower(btrim(p_email))),
    'waitlists', (select coalesce(jsonb_agg(jsonb_build_object('product', p.name, 'first_name', w.first_name,
                   'company_name', w.company_name, 'additional_info', w.additional_info, 'status', w.status,
                   'created_at', w.created_at)), '[]')
                  from public.waitlist_registrations w join public.saas_products p on p.id = w.product_id
                  where w.email = lower(btrim(p_email))),
    'contact_submissions', (select coalesce(jsonb_agg(jsonb_build_object('full_name', c.full_name, 'category', c.category,
                   'subject', c.subject, 'message', c.message, 'created_at', c.created_at)), '[]')
                  from public.contact_submissions c where c.email = lower(btrim(p_email))),
    'emails_sent', (select coalesce(jsonb_agg(jsonb_build_object('type', d.message_type, 'status', d.status,
                   'created_at', d.created_at)), '[]')
                  from public.email_deliveries d where d.recipient_email = lower(btrim(p_email)))
  );
$$;

create or replace function public.delete_personal_data(p_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(p_email));
  v_ids uuid[];
  v_counts jsonb := '{}';
  n integer;
begin
  select coalesce(array_agg(id), '{}') into v_ids from (
    select id from public.newsletter_subscribers where email = v_email
    union all select id from public.waitlist_registrations where email = v_email
    union all select id from public.contact_submissions where email = v_email) t;

  delete from public.campaign_recipients where email = v_email;              get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('campaign_recipients', n);
  delete from public.email_deliveries where recipient_email = v_email;       get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('email_deliveries', n);
  delete from public.automation_events where aggregate_id = any (v_ids);     get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('automation_events', n);
  delete from public.newsletter_subscribers where email = v_email;           get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('newsletter_subscribers', n);
  delete from public.waitlist_registrations where email = v_email;           get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('waitlist_registrations', n);
  delete from public.contact_submissions where email = v_email;              get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('contact_submissions', n);
  return v_counts;
end $$;

-- ---------------------------------------------------------------------------
-- Housekeeping (scheduled daily by supabase/setup/schedule-jobs.sql)
-- ---------------------------------------------------------------------------
create or replace function public.purge_expired_data() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a integer; b integer; c integer;
begin
  delete from public.rate_limits where window_start < now() - interval '2 days';
  get diagnostics a = row_count;
  delete from public.newsletter_tokens where expires_at < now() - interval '30 days';
  get diagnostics b = row_count;
  -- Pending subscribers who never confirmed within 30 days are removed.
  delete from public.newsletter_subscribers where status = 'pending' and coalesce(last_confirmation_requested_at, created_at) < now() - interval '30 days';
  get diagnostics c = row_count;
  return jsonb_build_object('rate_limits', a, 'tokens', b, 'stale_pending_subscribers', c);
end $$;

-- ---------------------------------------------------------------------------
-- Grants: service role only. (is_admin is used inside RLS policies.)
-- ---------------------------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname <> 'is_admin' and p.proname <> 'set_updated_at'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;
