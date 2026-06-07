// Centralized site configuration. Values come from NEXT_PUBLIC_* env vars (see
// .env.example) with development-friendly fallbacks so pages always render. The
// placeholders from the design (CHROME_STORE_URL, GITHUB_URL, etc.) are threaded
// through here rather than hardcoded in the markup.

const githubUrl =
  process.env.NEXT_PUBLIC_GITHUB_URL ?? "https://github.com/jpreecedev/mend-a11y";

export const site = {
  name: "Mend",
  githubUrl,
  githubIssuesUrl:
    process.env.NEXT_PUBLIC_GITHUB_ISSUES_URL ?? `${githubUrl}/issues`,
  chromeStoreUrl: process.env.NEXT_PUBLIC_CHROME_STORE_URL ?? "#",
  // Empty means "no public email yet"; contact links fall back to GitHub issues.
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "",
  privacyEffectiveDate:
    process.env.NEXT_PUBLIC_PRIVACY_EFFECTIVE_DATE ?? "[DATE]",
} as const;
