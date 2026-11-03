// Functional form components. All forms are handled by /assets/js/site.js,
// which POSTs JSON to the Supabase Edge Functions configured in site.config.mjs.

import { emphasise, esc, WRAP } from "./partials.mjs";

const honeypot = (id) =>
  `<div class="hp" aria-hidden="true"><label for="${id}-website">Leave this field empty</label><input id="${id}-website" name="website" type="text" tabindex="-1" autocomplete="off"></div>`;

const NEWSLETTER_CONSENT = (site) =>
  `I'd like to receive the newsletter by email. I can unsubscribe at any time using the link in every email. See the <a href="${site.legal.privacyUrl}">privacy policy</a>.`;

// ---------------------------------------------------------------------------
// SaaS waiting list: the design's navy section, reusable for any product
// ---------------------------------------------------------------------------
export function waitlistSection(site, product, { headingTag = "h2", sectionId = "waitlist" } = {}) {
  const id = `wl-${product.slug}`;
  return `<section id="${sectionId}" style="background: #1B2A41; color: #F1ECE2" aria-labelledby="${id}-title">
<div style="${WRAP}; padding: clamp(56px, 8vw, 112px) clamp(20px, 4vw, 48px); display: flex; flex-wrap: wrap; gap: 48px 64px; align-items: flex-end">

<div style="flex: 1.2 1 340px; display: flex; flex-direction: column; gap: 20px">
<span style="font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: #B9C2D0">${esc(product.eyebrow ?? "In development · Early access")}</span>
<${headingTag} id="${id}-title" style="margin: 0; font-family: 'Instrument Serif', Georgia, serif; font-weight: 400; font-size: clamp(52px, 8vw, 112px); line-height: 0.95; letter-spacing: -0.01em">${emphasise(product.name)}</${headingTag}>
<p style="margin: 0; max-width: 480px; font-size: 18px; color: #D5DBE5">${esc(product.description)}</p>
</div>

<div class="on-navy" style="flex: 1 1 340px; max-width: 520px">
<form class="form" data-form="waitlist" data-product="${esc(product.slug)}" novalidate>
<div class="form-row">
<div class="field"><label class="field-label" for="${id}-first">First name</label>
<input class="input" id="${id}-first" name="first_name" type="text" autocomplete="given-name" maxlength="80" required placeholder="Your first name"></div>
<div class="field"><label class="field-label" for="${id}-email">Email address</label>
<input class="input" id="${id}-email" name="email" type="email" autocomplete="email" maxlength="254" required placeholder="you@company.com"></div>
</div>
<div class="field"><label class="field-label" for="${id}-company">Company <span class="opt">(optional)</span></label>
<input class="input" id="${id}-company" name="company_name" type="text" autocomplete="organization" maxlength="160"></div>
<div class="field"><label class="field-label" for="${id}-info">Anything I should know? <span class="opt">(optional)</span></label>
<textarea class="input" id="${id}-info" name="additional_info" rows="3" maxlength="2000" placeholder="What would you use it for?"></textarea></div>
<label class="check"><input type="checkbox" name="newsletter_opt_in" value="yes"> <span>Also send me the newsletter (optional, separate from this list; you'll be asked to confirm).</span></label>
${honeypot(id)}
<button class="btn" type="submit" style="height: 56px; border: 0; border-radius: 12px; background: #F1ECE2; color: #1B2A41; font-family: inherit; font-size: 16px; font-weight: 600; cursor: pointer">Join the waitlist</button>
<div class="form-error" role="alert" data-error hidden></div>
<div class="form-note">A confirmation now, then an email when there's something to try. Leave anytime. <a href="${site.legal.privacyUrl}">Privacy policy</a>.</div>
</form>
<div class="success-card" data-success tabindex="-1" hidden>
<div class="success-title">You're on the list.</div>
<div class="success-sub">I'll write when there's something to try.</div>
<div class="success-sub" data-newsletter-note hidden>Check your inbox to confirm your newsletter subscription.</div>
</div>
</div>

</div>
</section>`;
}

// ---------------------------------------------------------------------------
// Contact form (charcoal)
// ---------------------------------------------------------------------------
export function contactForm(site) {
  const c = "contact";
  return `<div class="block" id="contact-form">
<div class="block-intro">
<span class="eyebrow">Send a message</span>
<h3 class="block-title">Tell me about <em>your project.</em></h3>
<p class="block-text">Business, collaboration, a SaaS idea or a technical question: pick the closest category and I'll take it from there.</p>
</div>
<div class="block-body on-ink">
<form class="form" data-form="contact" novalidate>
<div class="form-row">
<div class="field"><label class="field-label" for="${c}-name">Full name</label>
<input class="input" id="${c}-name" name="full_name" type="text" autocomplete="name" maxlength="120" required></div>
<div class="field"><label class="field-label" for="${c}-email">Email address</label>
<input class="input" id="${c}-email" name="email" type="email" autocomplete="email" maxlength="254" required placeholder="you@company.com"></div>
</div>
<div class="form-row">
<div class="field"><label class="field-label" for="${c}-category">Enquiry</label>
<select class="input" id="${c}-category" name="category" required>
<option value="" selected disabled>Choose a category</option>
<option value="business">Business enquiry</option>
<option value="collaboration">Collaboration</option>
<option value="saas">SaaS / Startup</option>
<option value="technology">Technology</option>
<option value="general">General enquiry</option>
<option value="other">Other</option>
</select></div>
<div class="field"><label class="field-label" for="${c}-subject">Subject</label>
<input class="input" id="${c}-subject" name="subject" type="text" maxlength="200" required></div>
</div>
<div class="field"><label class="field-label" for="${c}-message">Message</label>
<textarea class="input" id="${c}-message" name="message" rows="6" maxlength="5000" required placeholder="What are you trying to improve?"></textarea></div>
${honeypot(c)}
<div class="form-error" role="alert" data-error hidden></div>
<div class="form-actions">
<p class="form-note">Your details are only used to reply to you. See the <a href="${site.legal.privacyUrl}">privacy policy</a>.</p>
<button class="btn pill pill-accent" type="submit"><span>Send message</span><span aria-hidden="true">↗</span></button>
</div>
</form>
<div class="success-card" data-success tabindex="-1" hidden>
<div class="success-title">Message received.</div>
<div class="success-sub">Thanks for reaching out. I'll get back to you as soon as possible.</div>
</div>
</div>
</div>`;
}

// ---------------------------------------------------------------------------
// Newsletter (charcoal) — double opt-in, explicit consent
// ---------------------------------------------------------------------------
export function newsletterForm(site, { source = "website", idPrefix = "nl", withIntro = true } = {}) {
  const n = idPrefix;
  const form = `<form class="form" data-form="newsletter" data-source="${esc(source)}" novalidate>
<div class="form-row">
<div class="field"><label class="field-label" for="${n}-first">First name <span class="opt">(optional)</span></label>
<input class="input" id="${n}-first" name="first_name" type="text" autocomplete="given-name" maxlength="80"></div>
<div class="field"><label class="field-label" for="${n}-email">Email address</label>
<input class="input" id="${n}-email" name="email" type="email" autocomplete="email" maxlength="254" required placeholder="you@company.com"></div>
</div>
<label class="check"><input type="checkbox" name="consent" value="yes" required> <span>${NEWSLETTER_CONSENT(site)}</span></label>
${honeypot(n)}
<div class="form-error" role="alert" data-error hidden></div>
<div class="form-actions">
<p class="form-note">Double opt-in: nothing is sent until you confirm by email.</p>
<button class="btn pill pill-accent" type="submit"><span>Subscribe</span><span aria-hidden="true">↗</span></button>
</div>
</form>
<div class="success-card" data-success tabindex="-1" hidden>
<div class="success-title">Check your inbox.</div>
<div class="success-sub" data-success-message>Click the link in the email to confirm your subscription.</div>
</div>`;
  if (!withIntro) return `<div class="on-ink">${form}</div>`;
  return `<div class="block" id="newsletter">
<div class="block-intro">
<span class="eyebrow">Newsletter</span>
<h3 class="block-title">Notes on what <em>I'm building.</em></h3>
<p class="block-text">Occasional emails on what I'm building, developments in technology and AI, business insights and ideas I'm exploring. No unnecessary noise.</p>
</div>
<div class="block-body on-ink">${form}</div>
</div>`;
}
