// Secondary pages: per-product waitlist, newsletter confirm/unsubscribe, legal, 404.
import { newsletterForm, waitlistSection } from "../forms.mjs";
import { bigHeading, darkShell, esc, footerBar, head, nav, page, plain, WRAP } from "../partials.mjs";

// ---------------------------------------------------------------------------
// /waitlist/<slug>/ — same navy section, reusable for every SaaS product
// ---------------------------------------------------------------------------
export function waitlistPage(site, product, assets) {
  const body = `<header id="top" style="background: #161615; color: #F1ECE2">
<div style="${WRAP}; padding: 0 clamp(20px, 4vw, 48px)">${nav(site, { home: false })}</div>
</header>
<main id="main">
${waitlistSection(site, product, { headingTag: "h1" })}
</main>
<section style="background: #161615; color: #F1ECE2"><div style="${WRAP}; padding: 0 clamp(20px, 4vw, 48px) 32px clamp(20px, 4vw, 48px)">${footerBar(site)}</div></section>`;
  return page(site, head(site, {
    title: `${plain(product.name)}: early access`, description: product.description,
    path: `/waitlist/${product.slug}/`, assets,
  }), body);
}

// ---------------------------------------------------------------------------
// /newsletter/confirm/?token=...  (the page POSTs the token; see site.js)
// ---------------------------------------------------------------------------
export function confirmPage(site, assets) {
  const inner = `<div data-page="confirm" style="display: flex; flex-direction: column; gap: 32px; padding: clamp(56px, 9vw, 120px) 0 clamp(24px, 4vw, 48px) 0">
<span style="font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: #A8A59D">Newsletter</span>
<div data-state="loading">${bigHeading("h1", "Confirming", "one moment.", site)}</div>
<div data-state="confirmed" hidden>${bigHeading("h1", "You're", "in.", site, 'tabindex="-1"')}</div>
<div data-state="already_confirmed" hidden>${bigHeading("h1", "Already", "confirmed.", site, 'tabindex="-1"')}</div>
<div data-state="expired" hidden>${bigHeading("h1", "Link", "expired.", site, 'tabindex="-1"')}</div>
<div data-state="invalid" hidden>${bigHeading("h1", "Link", "not valid.", site, 'tabindex="-1"')}</div>
<div data-state="error" hidden>${bigHeading("h1", "Something", "went wrong.", site, 'tabindex="-1"')}</div>
<p data-message role="status" aria-live="polite" style="margin: 0; max-width: 620px; font-size: clamp(18px, 1.8vw, 22px); line-height: 1.45; color: #D8D3C8">Checking your confirmation link…</p>
<div data-resubscribe hidden style="max-width: 720px">${newsletterForm(site, { source: "confirm_page", idPrefix: "resub", withIntro: false })}</div>
<div><a class="btn" href="/" style="height: 56px; box-sizing: border-box; padding: 0 32px; border-radius: 999px; border: 1px solid #5A5851; display: inline-flex; align-items: center; font-weight: 600">Back to the homepage</a></div>
</div>`;
  return page(site, head(site, { title: "Confirm subscription", path: "/newsletter/confirm/", noindex: true, assets }), darkShell(site, inner));
}

// ---------------------------------------------------------------------------
// /newsletter/unsubscribe/?token=...  (explicit button press, then POST)
// ---------------------------------------------------------------------------
export function unsubscribePage(site, assets) {
  const inner = `<div data-page="unsubscribe" style="display: flex; flex-direction: column; gap: 32px; padding: clamp(56px, 9vw, 120px) 0 clamp(24px, 4vw, 48px) 0">
<span style="font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: #A8A59D">Email preferences</span>
<div data-state="ready">${bigHeading("h1", "Unsubscribe", "from emails.", site)}</div>
<div data-state="done" hidden>${bigHeading("h1", "You're", "unsubscribed.", site, 'tabindex="-1"')}</div>
<div data-state="invalid" hidden>${bigHeading("h1", "Link", "not valid.", site, 'tabindex="-1"')}</div>
<div data-state="error" hidden>${bigHeading("h1", "Something", "went wrong.", site, 'tabindex="-1"')}</div>
<p data-message role="status" aria-live="polite" style="margin: 0; max-width: 620px; font-size: clamp(18px, 1.8vw, 22px); line-height: 1.45; color: #D8D3C8">Press the button below and you won't receive any more emails from this list.</p>
<div style="display: flex; flex-wrap: wrap; gap: 12px">
<button class="btn" type="button" data-unsubscribe style="height: 56px; box-sizing: border-box; padding: 0 32px; border-radius: 999px; border: 0; background: ${site.accent}; color: #161615; display: flex; align-items: center; font-weight: 600; font-family: inherit; font-size: 16px; cursor: pointer">Unsubscribe</button>
<a class="btn" href="/" style="height: 56px; box-sizing: border-box; padding: 0 32px; border-radius: 999px; border: 1px solid #5A5851; display: flex; align-items: center; font-weight: 600">Back to the homepage</a>
</div>
</div>`;
  return page(site, head(site, { title: "Unsubscribe", path: "/newsletter/unsubscribe/", noindex: true, assets }), darkShell(site, inner));
}

// ---------------------------------------------------------------------------
// Legal pages (cream, like the Services section)
// ---------------------------------------------------------------------------
function legalPage(site, assets, { title, italic, path, description, content }) {
  const body = `<header id="top" style="background: #161615; color: #F1ECE2">
<div style="${WRAP}; padding: 0 clamp(20px, 4vw, 48px)">${nav(site, { home: false })}</div>
</header>
<main id="main">
<section style="background: #F1ECE2; color: #1D1D1B">
<div style="${WRAP}; padding: clamp(56px, 8vw, 104px) clamp(20px, 4vw, 48px)">
<h1 style="margin: 0 0 40px 0; font-weight: 700; text-transform: uppercase; letter-spacing: -0.035em; line-height: 0.9; font-size: clamp(40px, 7vw, 96px)">${esc(title)} <span style="font-family: 'Instrument Serif', Georgia, serif; font-style: italic; font-weight: 400; text-transform: none; letter-spacing: -0.01em">${esc(italic)}</span></h1>
<div class="prose">${content}</div>
</div>
</section>
</main>
<section style="background: #161615; color: #F1ECE2"><div style="${WRAP}; padding: 0 clamp(20px, 4vw, 48px) 32px clamp(20px, 4vw, 48px)">${footerBar(site)}</div></section>`;
  return page(site, head(site, { title: `${title} ${italic}`, description, path, assets }), body);
}

export function privacyPage(site, assets) {
  const L = site.legal;
  const contactEmail = L.privacyEmail || site.contact.email;
  const contactLine = contactEmail
    ? `<a href="mailto:${esc(contactEmail)}">${esc(contactEmail)}</a>`
    : `the <a href="/#contact-form">contact form</a>`;
  const analytics = site.analytics.provider
    ? `<li><strong>Analytics:</strong> ${esc(site.analytics.provider === "plausible" ? "Plausible Analytics" : "Umami")}, a cookieless analytics tool that counts page views and form events without identifying you.</li>`
    : "";
  const content = `
<p class="callout"><strong>Draft for review.</strong> This policy describes how this website actually handles data, but it is a template, not legal advice. Have it reviewed for the laws that apply to you (for example Mauritius' Data Protection Act 2017 and, if you have visitors in the EU/UK, the GDPR) before relying on it. Last updated: ${esc(L.lastUpdated)}.</p>

<h2>Who is responsible</h2>
<p>${esc(L.controllerName)}, ${esc(site.location)}, is responsible for the personal data collected on ${esc(site.url.replace(/^https?:\/\//, ""))}. For any privacy question or request, contact ${contactLine}.</p>

<h2>What I collect and why</h2>
<table>
<thead><tr><th>Form</th><th>Data</th><th>Purpose and basis</th></tr></thead>
<tbody>
<tr><td>Newsletter</td><td>Email, optional first name, consent time and wording, confirmation and unsubscribe times</td><td>Sending the newsletter, <strong>only with your consent</strong>, which you give by ticking the box and confirming by email (double opt-in).</td></tr>
<tr><td>SaaS waiting lists</td><td>First name, email, optional company and notes, the product you chose</td><td>Telling you about that product (early access, beta, launch). Joining a waiting list <strong>does not</strong> subscribe you to the newsletter.</td></tr>
<tr><td>Contact form</td><td>Name, email, category, subject, message</td><td>Replying to your enquiry.</td></tr>
</tbody>
</table>
<p>To protect the forms from abuse, a one-way hash of your IP address is used for rate limiting and deleted within two days. Your raw IP address is not stored.</p>

<h2>Emails</h2>
<ul>
<li>Newsletter emails are only sent to people who confirmed their subscription. Every one contains an unsubscribe link that works immediately.</li>
<li>Waiting-list emails contain a link to leave that list.</li>
<li>I record whether each email was accepted by the mail server, to detect delivery problems. I do not use tracking pixels or link tracking.</li>
</ul>

<h2>Who processes the data</h2>
<ul>
<li><strong>Supabase</strong>: database and backend hosting, where the records are stored.</li>
<li><strong>n8n</strong>: workflow automation that sends the emails.</li>
<li><strong>Hostinger</strong>: email hosting and delivery.</li>
<li><strong>Website hosting provider</strong>: serves the website files.</li>
${analytics}
</ul>
<p>These providers may store data outside your country. I do not sell personal data or share it for advertising.</p>

<h2>How long it is kept</h2>
<ul>
<li>Unconfirmed newsletter sign-ups are deleted after 30 days.</li>
<li>Subscribers are kept until they unsubscribe. After that, the email address and unsubscribe date are kept only so that the unsubscribe is respected.</li>
<li>Waiting-list registrations are kept until the product launches or is discontinued, or until you leave the list.</li>
<li>Contact messages are kept for as long as needed to handle your enquiry and any follow-up.</li>
</ul>

<h2>Your choices and rights</h2>
<p>You can unsubscribe or leave a waiting list at any time with the link in any email. You can also ask for a copy of your data, a correction, or deletion of everything held about you, by contacting ${contactLine}. Depending on where you live, you may also have the right to object or to complain to your data protection authority.</p>

<h2>Cookies</h2>
<p>This website does not set advertising or tracking cookies.${site.analytics.provider ? " The analytics tool used is cookieless." : ""}</p>

<h2>Changes</h2>
<p>If this policy changes, the updated version will be posted here with a new date.</p>`;
  return legalPage(site, assets, { title: "Privacy", italic: "policy", path: "/privacy/", description: `How ${site.name} collects, uses and protects personal data.`, content });
}

export function termsPage(site, assets) {
  const content = `
<p class="callout"><strong>Draft for review.</strong> These are simple website terms, not legal advice. Have them reviewed before relying on them. Last updated: ${esc(site.legal.lastUpdated)}.</p>
<h2>Using this website</h2>
<p>This website presents the work of ${esc(site.name)} and the ventures listed on it. You may browse it, share links to it and contact me through it. Please don't misuse the forms, attempt to disrupt the site, or submit other people's details without their permission.</p>
<h2>Information on this site</h2>
<p>Content is provided for general information. I aim to keep it accurate but can't guarantee it is complete or current. Nothing here is a binding offer; any work together is agreed separately in writing.</p>
<h2>Waiting lists and early access</h2>
<p>Joining a waiting list registers your interest. It isn't a purchase or a guarantee of access, pricing or launch dates.</p>
<h2>Links to other sites</h2>
<p>Links to external websites and social networks are provided for convenience. I'm not responsible for their content or practices.</p>
<h2>Intellectual property</h2>
<p>The text, design and branding on this site belong to ${esc(site.name)} unless stated otherwise. Fonts are used under the SIL Open Font License.</p>
<h2>Privacy</h2>
<p>How personal data is handled is explained in the <a href="${site.legal.privacyUrl}">privacy policy</a>.</p>
<h2>Contact</h2>
<p>Questions about these terms? Use the <a href="/#contact-form">contact form</a>${site.contact.email ? ` or email <a href="mailto:${esc(site.contact.email)}">${esc(site.contact.email)}</a>` : ""}.</p>`;
  return legalPage(site, assets, { title: "Terms", italic: "of use", path: "/terms/", description: `Terms of use for the ${site.name} website.`, content });
}

export function notFoundPage(site, assets) {
  const inner = `<div style="display: flex; flex-direction: column; gap: 32px; padding: clamp(56px, 9vw, 120px) 0 clamp(24px, 4vw, 48px) 0">
<span style="font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: #A8A59D">404</span>
${bigHeading("h1", "Page", "not found.", site)}
<p style="margin: 0; max-width: 620px; font-size: clamp(18px, 1.8vw, 22px); line-height: 1.45; color: #D8D3C8">The page you're looking for doesn't exist or has moved.</p>
<div><a class="btn" href="/" style="height: 56px; box-sizing: border-box; padding: 0 32px; border-radius: 999px; background: ${site.accent}; color: #161615; display: inline-flex; align-items: center; font-weight: 600">Back to the homepage</a></div>
</div>`;
  return page(site, head(site, { title: "Page not found", path: "/404.html", noindex: true, assets }), darkShell(site, inner));
}
