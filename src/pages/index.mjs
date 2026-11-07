// Home page: the original landing page design, made functional.
import { contactForm, newsletterForm, waitlistSection } from "../forms.mjs";
import { esc, ext, footerBar, head, nav, page, socialLinks, SOCIALS, WRAP } from "../partials.mjs";
import { heroPipeline, marks } from "../illustrations.mjs";

/** A venture row. With a URL it's a link (as in the design); without, a static row. */
function ventureRow(url, attrs, inner, label) {
  if (url) {
    return `<a class="row vrow rv" href="${esc(url)}"${ext(url)} data-track="venture_click" data-track-label="${esc(label)}" ${attrs}>\n${inner}\n</a>`;
  }
  return `<div class="row vrow is-static rv" ${attrs}>\n${inner}\n</div>`;
}

export default function render(site, assets) {
  const featured = site.products.find((p) => p.featured) ?? site.products[0];
  const v = site.ventures;
  const sameAs = [...SOCIALS.map((s) => site.social[s.key]), ...Object.values(v)].filter(Boolean);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", "@id": `${site.url}/#website`, url: `${site.url}/`, name: site.name, inLanguage: site.locale },
      {
        "@type": "Person", "@id": `${site.url}/#person`, name: site.name, url: `${site.url}/`,
        description: site.description,
        address: { "@type": "PostalAddress", addressCountry: "MU" },
        ...(sameAs.length ? { sameAs } : {}),
      },
    ],
  };

  const body = `<!-- ============ HERO (dark) ============ -->
<header id="top" style="background: #161615; color: #F1ECE2">
<div style="${WRAP}; padding: 0 clamp(20px, 4vw, 48px)">

${nav(site)}

<!-- headline -->
<div style="display: flex; flex-direction: column; gap: 32px; padding: clamp(56px, 9vw, 120px) 0 clamp(40px, 5vw, 64px) 0">
<span style="font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: #A8A59D">AI &amp; automation · Growth marketing · ${esc(site.location)}</span>
<h1 class="reveal" style="margin: 0; font-weight: 700; text-transform: uppercase; letter-spacing: -0.045em; line-height: 0.9; font-size: clamp(44px, 9vw, 136px)"><span class="reveal-line"><span style="--i: 0">AI, automation</span></span><span class="reveal-line"><span style="--i: 1">&amp; marketing</span></span><span class="reveal-line"><span style="--i: 2; font-family: 'Instrument Serif', Georgia, serif; font-style: italic; font-weight: 400; text-transform: none; letter-spacing: -0.02em; color: ${site.accent}">that grow your business.</span></span></h1>
<div class="hero-split">
<div style="display: flex; flex-direction: column; gap: 32px; min-width: 0">
<p style="margin: 0; max-width: 620px; font-size: clamp(18px, 1.8vw, 22px); line-height: 1.45; color: #D8D3C8">I help businesses put AI to work, automate the manual processes that slow them down, and win more customers, through Agentra and Catalyst.</p>
<div style="display: flex; flex-wrap: wrap; gap: 12px">
<a class="btn sweep sweep-solid" href="#contact" data-track="cta_click" data-track-label="hero_work_with_me" style="height: 56px; box-sizing: border-box; padding: 0 32px; border-radius: 999px; background: ${site.accent}; color: #161615; display: flex; align-items: center; gap: 10px; font-weight: 600">Work with me <span class="nudge" aria-hidden="true">→</span></a>
<a class="btn sweep" href="#waitlist" data-track="cta_click" data-track-label="hero_waitlist" style="height: 56px; box-sizing: border-box; padding: 0 32px; border-radius: 999px; border: 1px solid #5A5851; display: flex; align-items: center; gap: 10px; font-weight: 600">Join the SaaS waitlist <span class="nudge" aria-hidden="true">→</span></a>
</div>
</div>
<div class="hero-art">${heroPipeline}</div>
</div>
</div>

<!-- socials -->
${socialLinks(site)}

</div>
</header>

<main id="main">
<!-- ============ SERVICES (cream) ============ -->
<section id="services" style="background: #F1ECE2; color: #1D1D1B" aria-labelledby="services-title">
<div style="${WRAP}; padding: clamp(56px, 8vw, 104px) clamp(20px, 4vw, 48px)">

<div style="display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 12px; padding-bottom: 28px">
<h2 id="services-title" style="margin: 0; font-weight: 700; text-transform: uppercase; letter-spacing: -0.035em; line-height: 0.9; font-size: clamp(40px, 7vw, 96px)">How I can <span style="font-family: 'Instrument Serif', Georgia, serif; font-style: italic; font-weight: 400; text-transform: none; letter-spacing: -0.01em">help</span></h2>
<span style="font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: #66645F">Two agencies, one conversation</span>
</div>

${ventureRow(v.agentra, `style="display: flex; flex-wrap: wrap; align-items: baseline; gap: 12px 32px; padding: 32px 0; border-top: 1px solid #1D1D1B"`, `<span style="flex: 0 0 48px; font-size: 13px; color: #66645F">01</span>
<span style="flex: 1 1 260px; font-family: 'Instrument Serif', Georgia, serif; font-size: clamp(44px, 6vw, 80px); line-height: 1"><span class="name"><span class="mark mark-lg">${marks.agentra}</span>Agentra</span></span>
<span style="flex: 2 1 300px; display: flex; flex-direction: column; gap: 8px">
<span style="font-size: 20px">AI implementation and automation for your business.</span>
<span style="font-size: 14px; color: #66645F">Process optimisation · AI-powered solutions · Websites &amp; software</span>
</span>
<span class="arrow" aria-hidden="true" style="font-size: 28px">↗</span>`, "agentra")}

${ventureRow(v.catalyst, `style="display: flex; flex-wrap: wrap; align-items: baseline; gap: 12px 32px; padding: 32px 0; border-top: 1px solid #1D1D1B; border-bottom: 1px solid #1D1D1B"`, `<span style="flex: 0 0 48px; font-size: 13px; color: #66645F">02</span>
<span style="flex: 1 1 260px; font-family: 'Instrument Serif', Georgia, serif; font-size: clamp(44px, 6vw, 80px); line-height: 1"><span class="name"><span class="mark mark-lg">${marks.catalyst}</span>Catalyst</span></span>
<span style="flex: 2 1 300px; display: flex; flex-direction: column; gap: 8px">
<span style="font-size: 20px">Digital marketing that brings in customers.</span>
<span style="font-size: 14px; color: #66645F">Meta &amp; Google advertising · Customer acquisition · Marketing systems</span>
</span>
<span class="arrow" aria-hidden="true" style="font-size: 28px">↗</span>`, "catalyst")}

<div class="rv" style="font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: #66645F; padding: 64px 0 16px 0">Also building</div>

${ventureRow(v.mautalk, `style="display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 32px; padding: 24px 0; border-top: 1px solid #D6CFC0"`, `<span style="flex: 1 1 260px; font-family: 'Instrument Serif', Georgia, serif; font-size: clamp(32px, 4vw, 48px); line-height: 1.05"><span class="name"><span class="mark mark-sm">${marks.mautalk}</span>MauTalk</span></span>
<span style="flex: 2 1 300px; font-size: 16px; color: #4F4D49">Podcast. Conversations on business, technology and innovation.</span>
<span class="arrow" aria-hidden="true" style="font-size: 22px">↗</span>`, "mautalk")}

${ventureRow(v.dolceAttires, `style="display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 32px; padding: 24px 0; border-top: 1px solid #D6CFC0; border-bottom: 1px solid #D6CFC0"`, `<span style="flex: 1 1 260px; font-family: 'Instrument Serif', Georgia, serif; font-size: clamp(32px, 4vw, 48px); line-height: 1.05"><span class="name"><span class="mark mark-sm">${marks.dolceAttires}</span>Dolce Attires</span></span>
<span style="flex: 2 1 300px; font-size: 16px; color: #4F4D49">Online clothing brand. A side project, built in my free time.</span>
<span class="arrow" aria-hidden="true" style="font-size: 22px">↗</span>`, "dolce_attires")}

</div>
</section>

<!-- ============ WAITLIST (navy) ============ -->
${featured ? waitlistSection(site, featured) : ""}

<!-- ============ CONTACT / FOOTER (dark) ============ -->
<section id="contact" style="background: #161615; color: #F1ECE2" aria-labelledby="contact-title">
<div style="${WRAP}; padding: clamp(56px, 8vw, 112px) clamp(20px, 4vw, 48px) 32px clamp(20px, 4vw, 48px)">

<div class="rv" style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 32px 48px">
<h2 id="contact-title" style="margin: 0; font-weight: 700; text-transform: uppercase; letter-spacing: -0.045em; line-height: 0.86; font-size: clamp(56px, 13vw, 190px)">Let's<br><span style="font-family: 'Instrument Serif', Georgia, serif; font-style: italic; font-weight: 400; text-transform: none; letter-spacing: -0.02em; color: ${site.accent}">talk.</span></h2>
<div style="flex: 0 1 400px; display: flex; flex-direction: column; gap: 14px">
<p style="margin: 0; color: #A8A59D; font-size: 16px">Tell me what you're trying to improve, whether that's the process, the marketing or the tech. I'll tell you honestly if and how I can help.</p>
${site.contact.email ? `<a class="btn sweep sweep-solid" href="mailto:${esc(site.contact.email)}" data-track="contact_email_click" style="height: 56px; box-sizing: border-box; padding: 0 28px; border-radius: 999px; background: ${site.accent}; color: #161615; display: flex; align-items: center; justify-content: space-between; font-weight: 600"><span>${esc(site.contact.email)}</span><span aria-hidden="true">↗</span></a>` : `<a class="btn sweep sweep-solid" href="#contact-form" style="height: 56px; box-sizing: border-box; padding: 0 28px; border-radius: 999px; background: ${site.accent}; color: #161615; display: flex; align-items: center; justify-content: space-between; font-weight: 600"><span>Send a message</span><span aria-hidden="true">↓</span></a>`}
<a class="btn sweep" href="/${assets.vcard}" download data-track="save_contact" style="height: 56px; box-sizing: border-box; padding: 0 28px; border-radius: 999px; border: 1px solid #5A5851; display: flex; align-items: center; justify-content: space-between; font-weight: 600"><span>Save contact</span><span aria-hidden="true">↓</span></a>
</div>
</div>

${contactForm(site)}

${newsletterForm(site)}

${footerBar(site)}

</div>
</section>
</main>`;

  return page(site, head(site, { path: "/", jsonLd, assets }), body);
}
