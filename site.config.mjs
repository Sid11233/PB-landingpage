// =============================================================================
// SITE CONFIGURATION: the one place to update links, contact details,
// products and SEO. Everything here is PUBLIC (it ends up in the built site).
// Secrets never go here; they live in Supabase function secrets and n8n.
//
// Each value can also be overridden with an environment variable at build time
// (handy for hosting dashboards). Empty strings mean "not configured": the link
// or button is hidden automatically.
// =============================================================================

const env = (key, fallback = "") => (process.env[key] ?? fallback).trim();

export default {
  name: env("SITE_NAME", "Sid Jugasing"),
  /** Production URL, no trailing slash, e.g. "https://sidjugasing.com". Used for canonical/OG/sitemap. */
  url: env("SITE_URL", "http://localhost:8080"),
  title: "Sid Jugasing · AI, automation & marketing",
  description:
    "I help businesses put AI to work, automate the manual processes that slow them down, and win more customers, through Agentra and Catalyst.",
  location: "Mauritius",
  locale: "en",
  /** Accent colour from the design (alternatives offered in the design file: #C9B79C, #C8553D). */
  accent: "#A9BBD6",

  /** Supabase Edge Functions base URL: https://<project-ref>.supabase.co/functions/v1 */
  apiBaseUrl: env("PUBLIC_API_BASE_URL", ""),

  contact: {
    /** Public contact address shown on the site (mailto button + vCard). */
    email: env("CONTACT_EMAIL", ""),
    /** Phone for the vCard only (optional, international format). */
    phone: env("CONTACT_PHONE", ""),
  },

  legal: {
    privacyUrl: "/privacy/",
    termsUrl: "/terms/",
    /** Who is responsible for the data (shown in the privacy policy). */
    controllerName: env("LEGAL_CONTROLLER_NAME", "Sid Jugasing"),
    /** Where people send privacy / data requests. Falls back to contact.email. */
    privacyEmail: env("PRIVACY_EMAIL", ""),
    lastUpdated: "3 November 2026",
  },

  /** Social profiles. Paste full URLs. Leave empty to hide. */
  social: {
    instagram: env("INSTAGRAM_URL", ""),
    linkedin: env("LINKEDIN_URL", ""),
    tiktok: env("TIKTOK_URL", ""),
    x: env("X_URL", ""),
    github: env("GITHUB_URL", ""),
    youtube: env("YOUTUBE_URL", ""),
  },

  /** Venture links in "How I can help" / "Also building". Empty = row shown without a link. */
  ventures: {
    agentra: env("AGENTRA_URL", "https://agentra.mu"),
    catalyst: env("CATALYST_URL", ""),
    mautalk: env("MAUTALK_URL", ""),
    dolceAttires: env("DOLCE_ATTIRES_URL", ""),
  },

  /**
   * SaaS products with a waiting list. Each one gets a page at /waitlist/<slug>/.
   * The slug MUST also exist in the Supabase table saas_products with status
   * 'waitlist_open' (run `npm run products:sql` to generate the SQL).
   * `name` may wrap one word in *asterisks* to set it in italic, as in the design.
   * The product with `featured: true` is shown on the home page.
   */
  products: [
    {
      slug: "first-product",
      name: "[Product *name*]",
      description: "[One sentence on what it does and who it is for.]",
      eyebrow: "In development · Early access",
      featured: true,
    },
  ],

  /**
   * Privacy-friendly analytics (cookieless). Leave provider empty for none.
   *   provider: "plausible" | "umami"
   *   scriptUrl: e.g. "https://plausible.io/js/script.tagged-events.js" or your Umami script URL
   *   siteId: Plausible domain (e.g. "sidjugasing.com") or Umami website ID
   */
  analytics: {
    provider: env("ANALYTICS_PROVIDER", ""),
    scriptUrl: env("ANALYTICS_SCRIPT_URL", ""),
    siteId: env("ANALYTICS_SITE_ID", ""),
  },
};
