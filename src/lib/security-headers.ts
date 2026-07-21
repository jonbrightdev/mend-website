/* ============================================================
   Response security headers, applied to every route by the
   `routeRules` entry in vite.config.ts.

   Kept in its own module, rather than inline in the build config,
   so the policy is unit-testable: a typo in a CSP directive fails
   silently at runtime — the browser drops the directive it cannot
   parse and enforces nothing — so the tests here are the only
   thing that notices.
   ============================================================ */

/**
 * The Content-Security-Policy.
 *
 * Deliberately **does not set `script-src` or `default-src`.** TanStack Start
 * server-renders an inline `<script>` carrying the dehydrated router state,
 * and blocking it breaks hydration on every page. Restricting it properly
 * means threading a per-request nonce through the SSR pipeline, which is a
 * real piece of work rather than a config line — until then, claiming a
 * `script-src` we would have to weaken with `'unsafe-inline'` would buy
 * nothing but the appearance of protection.
 *
 * **Do not "discover" that the app has no inline scripts and tighten this.**
 * That inline script ends with `document.currentScript.remove()`, so by the
 * time anything can inspect the DOM it has deleted itself: counting
 * `document.querySelectorAll("script")` in a browser reports zero inline
 * scripts on every page, which is a measurement artifact and not a fact about
 * the app. Check `curl`'s raw HTML instead — and note that grep sees these
 * single-line responses as binary and silently prints nothing, so `grep -c`
 * reports 0 there too. Two independent tools agreeing on the wrong answer is
 * what makes this worth writing down.
 *
 * The real path to a strict `script-src` is the nonce the framework already
 * supports (`router.options.ssr.nonce` appears in the SSR bundle); that is the
 * follow-up, not deleting this paragraph.
 *
 * What is here is the subset that is both meaningful and independent of inline
 * scripts:
 *
 * - `frame-ancestors 'none'` — clickjacking. The dashboard has destructive
 *   controls (delete audits, revoke keys, cancel a subscription), which is
 *   exactly what framing attacks aim at.
 * - `base-uri 'self'` — stops an injected `<base>` from repointing every
 *   relative URL on the page, including the ones the router builds.
 * - `form-action 'self'` — stops an injected form from posting credentials
 *   off-site. Safe here: sign-in and Checkout are fetch calls and top-level
 *   navigations, neither of which is a form submission.
 * - `object-src 'none'` — plugin embeds; nothing legitimate uses them.
 */
export const CONTENT_SECURITY_POLICY = [
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

/**
 * HSTS, one year, **without `includeSubDomains` or `preload`**.
 *
 * Both are close to irreversible in practice — browsers cache the directive
 * for the full max-age, and a preload entry has to be removed upstream and
 * waited out. `includeSubDomains` would also bind every subdomain of the
 * apex, including any that does not exist yet. Adding either is a deliberate
 * operational decision about the whole domain, not a default a build config
 * should make on the operator's behalf.
 */
export const STRICT_TRANSPORT_SECURITY = "max-age=31536000";

/**
 * Features the site never uses. Denying them means an injected script or
 * embedded frame cannot prompt the user for hardware access under our origin's
 * name — the prompt would carry our domain, so the credibility being spent is
 * ours.
 */
export const PERMISSIONS_POLICY = ["camera=()", "microphone=()", "geolocation=()", "payment=()"].join(", ");

/**
 * The full header map, applied to every response.
 *
 * `X-Frame-Options` duplicates the CSP's `frame-ancestors` on purpose: the two
 * are redundant in current browsers, and the legacy header is what a security
 * scanner or an older client actually looks for.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
  "Strict-Transport-Security": STRICT_TRANSPORT_SECURITY,
  "Permissions-Policy": PERMISSIONS_POLICY,
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  // strict-origin-when-cross-origin: full URL on same-origin navigation, bare
  // origin cross-origin, nothing at all on an HTTPS→HTTP downgrade. Audit
  // detail URLs carry an audit id, so the paths are worth not leaking.
  "Referrer-Policy": "strict-origin-when-cross-origin",
};
