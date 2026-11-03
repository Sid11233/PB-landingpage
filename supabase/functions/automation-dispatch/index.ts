// Called every minute by pg_cron (see supabase/setup/schedule-jobs.sql).
// Header: X-Dispatch-Secret: <DISPATCH_SECRET>
import { config } from "../_shared/config.ts";
import { safeEqual } from "../_shared/crypto.ts";
import { dispatchDue } from "../_shared/outbox.ts";

Deno.serve(async (req) => {
  const secret = req.headers.get("x-dispatch-secret") ?? "";
  if (req.method !== "POST" || !config.dispatchSecret || !safeEqual(secret, config.dispatchSecret)) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorised" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }
  const result = await dispatchDue(25);
  return new Response(JSON.stringify({ ok: true, ...result }), { headers: { "Content-Type": "application/json" } });
});
