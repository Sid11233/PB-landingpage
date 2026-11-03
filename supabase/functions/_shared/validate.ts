import { HttpError } from "./http.ts";

// Pragmatic email check: local@domain.tld, no spaces, sensible lengths.
const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;

export function normaliseEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const e = v.trim().toLowerCase();
  if (e.length > 254 || !EMAIL_RE.test(e)) return null;
  const [local] = e.split("@");
  if (local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return null;
  return e;
}

/** Trims, strips control characters (keeps newlines when multiline) and enforces a max length. */
export function cleanText(v: unknown, max: number, multiline = false): string {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string") return "";
  const ctrl = multiline ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g;
  const s = v.replace(/\r\n?/g, "\n").replace(ctrl, "").trim();
  return s.length > max ? "\u0000TOO_LONG" : s;
}

/** Collects field errors, then throws one 400 with all of them. */
export class Validator {
  fields: Record<string, string> = {};
  require(name: string, value: string, label: string, max: number) {
    if (value === "\u0000TOO_LONG") this.fields[name] = `${label} must be ${max} characters or fewer.`;
    else if (!value) this.fields[name] = `Please enter your ${label.toLowerCase()}.`;
    return value;
  }
  optional(name: string, value: string, label: string, max: number) {
    if (value === "\u0000TOO_LONG") this.fields[name] = `${label} must be ${max} characters or fewer.`;
    return value || null;
  }
  email(name: string, raw: unknown) {
    const e = normaliseEmail(raw);
    if (!e) this.fields[name] = "Please enter a valid email address.";
    return e ?? "";
  }
  fail(name: string, msg: string) {
    this.fields[name] = msg;
  }
  done() {
    if (Object.keys(this.fields).length) {
      throw new HttpError(400, Object.values(this.fields)[0], this.fields);
    }
  }
}
