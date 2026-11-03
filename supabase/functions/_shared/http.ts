import { config } from "./config.ts";

export class HttpError extends Error {
  constructor(public status: number, message: string, public fields?: Record<string, string>) {
    super(message);
  }
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const h: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && config.allowedOrigins.includes(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

export function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * Wraps a public browser-facing POST endpoint: CORS preflight, origin check,
 * method check, body size limit, JSON parsing and uniform error responses.
 */
export function publicEndpoint(handler: (req: Request, body: Record<string, unknown>) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
    try {
      if (req.method !== "POST") throw new HttpError(405, "Method not allowed.");
      const origin = req.headers.get("origin");
      // Browsers always send Origin on cross-origin POSTs; reject unknown sites.
      if (origin && !config.allowedOrigins.includes(origin.replace(/\/+$/, ""))) {
        throw new HttpError(403, "Origin not allowed.");
      }
      const body = await readJson(req);
      return await handler(req, body);
    } catch (err) {
      return errorResponse(req, err);
    }
  };
}

export async function readJson(req: Request, maxBytes = 16_384): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, "Request too large.");
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "Invalid request body.");
  }
}

export function errorResponse(req: Request, err: unknown): Response {
  if (err instanceof HttpError) {
    return json(req, err.status, { ok: false, error: err.message, ...(err.fields ? { fields: err.fields } : {}) });
  }
  console.error(err);
  return json(req, 500, { ok: false, error: "Something went wrong on our side. Please try again in a moment." });
}

/** Runs work after the response is sent when the runtime supports it. */
export function background(p: Promise<unknown>): Promise<unknown> | void {
  const safe = p.catch((e) => console.error("background task failed:", e));
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(safe);
  else return safe;
}
