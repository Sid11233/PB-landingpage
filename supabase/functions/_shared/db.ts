import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.49.4";
import { config } from "./config.ts";

let client: SupabaseClient | null = null;

/** Service-role client. Server-side only; bypasses RLS by design. */
export function db(): SupabaseClient {
  client ??= createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

/** Calls a SECURITY DEFINER function and throws on error. */
export async function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}
