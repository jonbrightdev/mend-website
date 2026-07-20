// Centralized site configuration. Values come from VITE_* env vars (see
// .env.example) with development-friendly fallbacks so pages always render. The
// placeholders from the design (CHROME_STORE_URL, GITHUB_URL, etc.) are threaded
// through here rather than hardcoded in the markup.

const githubUrl =
  import.meta.env.VITE_GITHUB_URL ?? "https://github.com/jpreecedev/mend-a11y";

export const site = {
  name: "Mend",
  githubUrl,
  githubIssuesUrl:
    import.meta.env.VITE_GITHUB_ISSUES_URL ?? `${githubUrl}/issues`,
  chromeStoreUrl: import.meta.env.VITE_CHROME_STORE_URL ?? "#",
  // Empty means "no public email yet"; contact links fall back to GitHub issues.
  contactEmail: import.meta.env.VITE_CONTACT_EMAIL ?? "",
  // The date the current policy text took effect. It belongs with the policy
  // it describes, so the default is the real date and bumps when privacy.tsx
  // changes materially — last updated when Stripe/OAuth/hosting processors
  // were disclosed. The env var stays as an ops override.
  privacyEffectiveDate:
    import.meta.env.VITE_PRIVACY_EFFECTIVE_DATE || "20 July 2026",
} as const;
