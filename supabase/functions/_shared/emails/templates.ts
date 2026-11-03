// Reusable email templates. Each returns { subject, html, text }.
//
// Anti-abuse rule: emails that go to an address typed into a public form
// (confirmations / acknowledgements) never repeat free text the visitor typed
// (message, company, etc.). Otherwise anyone could use the forms to send
// arbitrary content to a third party. The greeting name is reduced to a
// single plain word for the same reason.

import { button, esc, fieldTable, layout, p, small, textLayout } from "./layout.ts";

export interface Rendered { subject: string; html: string; text: string }
export interface Brand { siteName: string; siteUrl: string }

/** "Sid" from "Sid Jugasing"; anything that isn't a plain name becomes "there". */
export function safeFirstName(name: string | null | undefined): string {
  const first = String(name ?? "").trim().split(/\s+/)[0] ?? "";
  return /^[\p{L}\p{M}'’-]{1,40}$/u.test(first) ? first : "there";
}

const CATEGORY_LABELS: Record<string, string> = {
  business: "Business enquiry",
  collaboration: "Collaboration",
  saas: "SaaS / Startup",
  technology: "Technology",
  general: "General enquiry",
  other: "Other",
};
export const categoryLabel = (c: string) => CATEGORY_LABELS[c] ?? c;

// ---------------------------------------------------------------------------
// Newsletter
// ---------------------------------------------------------------------------
export function newsletterConfirmation(b: Brand, d: { firstName: string | null; confirmUrl: string; ttlHours: number }): Rendered {
  const name = safeFirstName(d.firstName);
  const reason = `You're receiving this because this address was entered in the newsletter form on ${b.siteUrl.replace(/^https?:\/\//, "")}. If that wasn't you, ignore this email and you won't be subscribed.`;
  const html = layout({
    ...b,
    preheader: "One click to confirm your subscription.",
    heading: "Confirm your *subscription*",
    bodyHtml:
      p(`Hi ${esc(name)},`) +
      p("Please confirm that you'd like to receive my newsletter. Nothing will be sent until you do.") +
      button(d.confirmUrl, "Confirm subscription") +
      small(`This link works once and expires in ${d.ttlHours} hours.`) +
      small(`Button not working? Paste this link into your browser:<br><a href="${esc(d.confirmUrl)}" style="color:#1B2A41;word-break:break-all">${esc(d.confirmUrl)}</a>`),
    reason,
  });
  const text = textLayout({
    ...b, heading: "Confirm your subscription", reason,
    body: `Hi ${name},\n\nPlease confirm that you'd like to receive my newsletter. Nothing will be sent until you do.\n\nConfirm: ${d.confirmUrl}\n\nThis link works once and expires in ${d.ttlHours} hours.`,
  });
  return { subject: "Confirm your subscription", html, text };
}

export function newsletterWelcome(b: Brand, d: { firstName: string | null; unsubscribeUrl: string }): Rendered {
  const name = safeFirstName(d.firstName);
  const reason = "You're receiving this because you subscribed to my newsletter and confirmed your email address.";
  const html = layout({
    ...b,
    preheader: "Thanks for joining. Here's what to expect.",
    heading: "Thanks for *joining.*",
    bodyHtml:
      p(`Hi ${esc(name)},`) +
      p("I'll occasionally share what I'm building, interesting developments in technology and AI, business insights, and ideas I'm exploring.") +
      p("No unnecessary noise.") +
      p(`— ${esc(b.siteName)}`),
    reason,
    unsubscribeUrl: d.unsubscribeUrl,
  });
  const text = textLayout({
    ...b, heading: "Thanks for joining.", reason, unsubscribeUrl: d.unsubscribeUrl,
    body: `Hi ${name},\n\nI'll occasionally share what I'm building, interesting developments in technology and AI, business insights, and ideas I'm exploring.\n\nNo unnecessary noise.\n\n— ${b.siteName}`,
  });
  return { subject: "Thanks for joining", html, text };
}

export function unsubscribeConfirmation(b: Brand): Rendered {
  const reason = "This is a one-time confirmation. You won't receive any further newsletter emails.";
  const html = layout({
    ...b,
    heading: "You're *unsubscribed*",
    bodyHtml: p("You've been removed from my newsletter. Sorry to see you go.") +
      small(`Changed your mind? You can subscribe again any time at <a href="${esc(b.siteUrl)}" style="color:#1B2A41">${esc(b.siteUrl.replace(/^https?:\/\//, ""))}</a>.`),
    reason,
  });
  const text = textLayout({ ...b, heading: "You're unsubscribed", reason,
    body: `You've been removed from my newsletter. Sorry to see you go.\n\nChanged your mind? Subscribe again at ${b.siteUrl}` });
  return { subject: "You're unsubscribed", html, text };
}

/** Wraps a campaign body (stored in newsletter_campaigns) in the branded layout. */
export function campaign(b: Brand, d: {
  subject: string; preheader: string | null; htmlBody: string; textBody: string;
  firstName: string | null; email: string; unsubscribeUrl: string;
}): Rendered {
  const name = safeFirstName(d.firstName);
  const merge = (s: string, escape: boolean) => s
    .replace(/\{\{\s*first_name_or_there\s*\}\}/g, escape ? esc(name) : name)
    .replace(/\{\{\s*first_name\s*\}\}/g, escape ? esc(d.firstName ?? "") : (d.firstName ?? ""))
    .replace(/\{\{\s*email\s*\}\}/g, escape ? esc(d.email) : d.email)
    .replace(/\{\{\s*unsubscribe_url\s*\}\}/g, escape ? esc(d.unsubscribeUrl) : d.unsubscribeUrl);
  const reason = "You're receiving this because you subscribed to my newsletter.";
  const subject = merge(d.subject, false);
  const html = layout({
    ...b, preheader: d.preheader ?? undefined, heading: subject,
    bodyHtml: merge(d.htmlBody, true), reason, unsubscribeUrl: d.unsubscribeUrl,
  });
  const text = textLayout({ ...b, heading: subject, body: merge(d.textBody, false), reason, unsubscribeUrl: d.unsubscribeUrl });
  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// Waiting list
// ---------------------------------------------------------------------------
export function waitlistConfirmation(b: Brand, d: {
  firstName: string; productName: string; productDescription: string | null; leaveUrl: string;
}): Rendered {
  const name = safeFirstName(d.firstName);
  const reason = `You're receiving this because this address joined the ${d.productName} waiting list on ${b.siteUrl.replace(/^https?:\/\//, "")}. This does not subscribe you to my newsletter.`;
  const html = layout({
    ...b,
    preheader: `You're on the ${d.productName} early-access list.`,
    heading: `You're on the *list.*`,
    bodyHtml:
      p(`Hi ${esc(name)},`) +
      p(`Thanks for your interest in <strong>${esc(d.productName)}</strong>. You're on the early-access list.`) +
      (d.productDescription ? p(esc(d.productDescription)) : "") +
      p("I'll write when there's something to try, such as early access, a beta invitation or the launch itself."),
    reason,
    unsubscribeUrl: d.leaveUrl,
    unsubscribeLabel: "Leave this waiting list",
  });
  const text = textLayout({
    ...b, heading: "You're on the list.", reason, unsubscribeUrl: d.leaveUrl,
    body: `Hi ${name},\n\nThanks for your interest in ${d.productName}. You're on the early-access list.\n${d.productDescription ? `\n${d.productDescription}\n` : ""}\nI'll write when there's something to try, such as early access, a beta invitation or the launch itself.`,
  });
  return { subject: `You're on the ${d.productName} waiting list`, html, text };
}

export function waitlistNotification(b: Brand, d: {
  productName: string; productSlug: string; firstName: string; email: string;
  companyName: string | null; additionalInfo: string | null; createdAt: string; total: number;
}): Rendered {
  const rows: [string, string][] = [
    ["Product", `${d.productName} (${d.productSlug})`],
    ["First name", d.firstName],
    ["Email", d.email],
    ["Company", d.companyName ?? ""],
    ["Additional info", d.additionalInfo ?? ""],
    ["Registered", d.createdAt],
    ["List size", String(d.total)],
  ];
  const reason = "Internal notification from your website's waiting-list form.";
  const html = layout({ ...b, heading: `New *waitlist* signup`, bodyHtml: fieldTable(rows), reason });
  const text = textLayout({ ...b, heading: "New waitlist signup", reason, body: rows.map(([k, v]) => `${k}: ${v || "-"}`).join("\n") });
  return { subject: `New waitlist signup: ${d.productName} (#${d.total})`, html, text };
}

// ---------------------------------------------------------------------------
// Contact form
// ---------------------------------------------------------------------------
export function contactNotification(b: Brand, d: {
  fullName: string; email: string; category: string; subject: string; message: string; createdAt: string;
}): Rendered {
  const rows: [string, string][] = [
    ["From", d.fullName],
    ["Email", d.email],
    ["Category", categoryLabel(d.category)],
    ["Subject", d.subject],
    ["Received", d.createdAt],
  ];
  const reason = "Internal notification from your website's contact form. Reply to this email to answer the sender directly.";
  const html = layout({
    ...b,
    heading: "New *enquiry*",
    bodyHtml: fieldTable(rows) +
      `<div style="margin:0 0 8px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#66645F">Message</div>` +
      `<div style="padding:16px;border-radius:10px;background:#F8F5EE;border:1px solid #D6CFC0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1D1D1B;white-space:pre-wrap;word-break:break-word">${esc(d.message)}</div>`,
    reason,
  });
  const text = textLayout({ ...b, heading: "New enquiry", reason,
    body: `${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\nMessage:\n${d.message}` });
  return { subject: `[${categoryLabel(d.category)}] ${d.subject}`.slice(0, 200), html, text };
}

export function contactAcknowledgement(b: Brand, d: { fullName: string; responseTime: string }): Rendered {
  const name = safeFirstName(d.fullName);
  const reason = `You're receiving this because this address was used to send a message through the contact form on ${b.siteUrl.replace(/^https?:\/\//, "")}. If that wasn't you, you can ignore this email.`;
  const html = layout({
    ...b,
    preheader: "Thanks for reaching out. Your message arrived.",
    heading: "Thanks for *reaching out.*",
    bodyHtml:
      p(`Hi ${esc(name)},`) +
      p(`Thanks for reaching out. I've received your message and will get back to you as soon as possible.${d.responseTime ? ` ${esc(d.responseTime)}` : ""}`) +
      p("Speak soon.") +
      p(`— ${esc(b.siteName)}`),
    reason,
  });
  const text = textLayout({ ...b, heading: "Thanks for reaching out.", reason,
    body: `Hi ${name},\n\nThanks for reaching out. I've received your message and will get back to you as soon as possible.${d.responseTime ? ` ${d.responseTime}` : ""}\n\nSpeak soon.\n\n— ${b.siteName}` });
  return { subject: "Thanks for reaching out", html, text };
}
