/* ============================================================
   Pure dashboard data model: types, the hand-written rule
   catalogue, and compute helpers. No database access here —
   this module is shared by server and client. Queries live in
   src/lib/dashboard-queries.ts (server only).
   ============================================================ */

export type Impact = "critical" | "serious" | "moderate" | "minor";

export const IMPACT_ORDER: Impact[] = ["critical", "serious", "moderate", "minor"];
export const IMPACT_RANK: Record<Impact, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };

export interface ViolationNode {
  target: string;
  html: string;
  failureSummary: string;
}

export interface Violation {
  id: string; // ruleId
  impact: Impact;
  help: string;
  helpUrl: string;
  description: string;
  tags: string[];
  nodes: ViolationNode[];
}

export interface AuditRecord {
  id: string;
  url: string;
  pageTitle: string;
  scannedAt: string; // ISO datetime
  history: number[]; // violation totals oldest→newest, aligned to runDates
  violations: Violation[];
}

export interface TrendPoint {
  date: string;
  total: number;
}

export interface RuleRow {
  ruleId: string;
  impact: Impact;
  help: string;
  helpUrl: string;
  count: number; // total nodes across pages in scope
  pageCount: number;
  auditId: string; // first audit containing this rule, for detail link
}

// --------------- Rule catalogue --------------------------------------
// Exported so the details page can access fix/before/after/wcag.

export interface RuleSpec {
  impact: Impact;
  help: string;
  helpUrl: string;
  description: string;
  fix: string;
  // Hand-written example; absent for rules we haven't documented yet.
  before?: string;
  after?: string;
  wcag: string[];
  tags: string[];
}

// Official W3C "Understanding" slugs, keyed by SC number. The slug isn't always
// derivable from the criterion label we store (e.g. 2.4.4 is shown as "Link
// Purpose" but the page is link-purpose-in-context), so map them explicitly.
const WCAG_SLUGS: Record<string, string> = {
  "1.1.1": "non-text-content",
  "1.3.1": "info-and-relationships",
  "1.3.5": "identify-input-purpose",
  "1.4.1": "use-of-color",
  "1.4.3": "contrast-minimum",
  "1.4.4": "resize-text",
  "2.1.1": "keyboard",
  "2.2.1": "timing-adjustable",
  "2.4.2": "page-titled",
  "2.4.3": "focus-order",
  "2.4.4": "link-purpose-in-context",
  "3.1.1": "language-of-page",
  "4.1.1": "parsing",
  "4.1.2": "name-role-value",
};

/**
 * Official WCAG Understanding URL for a criterion label like
 * "1.1.1 Non-text Content (A)", or null when we don't have a verified slug for
 * it (so the caller renders plain text rather than a broken link).
 */
export function wcagUnderstandingUrl(criterion: string): string | null {
  const num = criterion.match(/^[\d.]+/)?.[0]?.replace(/\.$/, "");
  const slug = num ? WCAG_SLUGS[num] : undefined;
  return slug
    ? `https://www.w3.org/WAI/WCAG21/Understanding/${slug}.html`
    : null;
}

export const RULES: Record<string, RuleSpec> = {
  "image-alt": {
    impact: "critical",
    help: "Images must have alternative text",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.10/image-alt",
    description: "Ensures <img> elements have alternate text or a role of none or presentation",
    fix: 'Add an alt attribute that conveys the image\'s purpose. Use alt="" for purely decorative images so screen readers skip them.',
    before: '<img src="/team/ana.jpg">',
    after: '<img src="/team/ana.jpg" alt="Ana Okafor, Head of Design">',
    wcag: ["1.1.1 Non-text Content (A)"],
    tags: ["wcag2a", "wcag111", "cat.text-alternatives"],
  },
  "label": {
    impact: "critical",
    help: "Form elements must have labels",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.10/label",
    description: "Ensures every form element has a label",
    fix: "Associate a visible <label> with the control via for/id, or give the control an aria-label. A placeholder is not a label.",
    before: '<input type="email" placeholder="Email">',
    after: '<label for="email">Email</label>\n<input id="email" type="email">',
    wcag: ["4.1.2 Name, Role, Value (A)", "1.3.1 Info and Relationships (A)"],
    tags: ["wcag2a", "wcag412", "wcag131", "cat.forms"],
  },
  "button-name": {
    impact: "critical",
    help: "Buttons must have discernible text",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.10/button-name",
    description: "Ensures buttons have discernible text",
    fix: "Give the button text content, or an aria-label when it only holds an icon.",
    before: '<button class="icon-close"></button>',
    after: '<button class="icon-close" aria-label="Close dialog"></button>',
    wcag: ["4.1.2 Name, Role, Value (A)"],
    tags: ["wcag2a", "wcag412", "cat.name-role-value"],
  },
  "aria-required-attr": {
    impact: "critical",
    help: "Required ARIA attributes must be provided",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.10/aria-required-attr",
    description: "Ensures elements with ARIA roles have all required ARIA attributes",
    fix: 'Add the ARIA attributes the role requires — e.g. a role="slider" needs aria-valuenow, aria-valuemin and aria-valuemax.',
    before: '<div role="slider"></div>',
    after: '<div role="slider" aria-valuenow="40" aria-valuemin="0" aria-valuemax="100"></div>',
    wcag: ["4.1.2 Name, Role, Value (A)"],
    tags: ["wcag2a", "wcag412", "cat.aria"],
  },
  "aria-allowed-attr": {
    impact: "critical",
    help: "Elements must only use supported ARIA attributes",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.10/aria-allowed-attr",
    description: "Ensure an element's role supports its ARIA attributes",
    fix: "Only use ARIA attributes the element's role actually supports. An attribute that isn't valid for the role is ignored by assistive tech, so drop it rather than leave it misleading in the markup.",
    before: '<input type="checkbox" aria-expanded="false">',
    after: '<input type="checkbox">',
    wcag: ["4.1.2 Name, Role, Value (A)"],
    tags: ["wcag2a", "wcag412", "cat.aria"],
  },
  "aria-valid-attr-value": {
    impact: "critical",
    help: "ARIA attributes must conform to valid values",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.10/aria-valid-attr-value",
    description: "Ensure all ARIA attributes have valid values",
    fix: "Give every ARIA attribute a value it accepts — a correctly spelled token, or an id that actually exists on the page. A stale aria-labelledby reference is a common cause.",
    before: '<span id="email-label">Email</span>\n<input aria-labelledby="emial-label">',
    after: '<span id="email-label">Email</span>\n<input aria-labelledby="email-label">',
    wcag: ["4.1.2 Name, Role, Value (A)"],
    tags: ["wcag2a", "wcag412", "cat.aria"],
  },
  "input-image-alt": {
    impact: "critical",
    help: "Image buttons must have alternate text",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.10/input-image-alt",
    description: 'Ensure <input type="image"> elements have alternate text',
    fix: "Give image-type inputs an alt attribute naming the action the button performs, the same way you would for a submit button's label.",
    before: '<input type="image" src="submit.png">',
    after: '<input type="image" src="submit.png" alt="Submit order">',
    wcag: ["1.1.1 Non-text Content (A)", "4.1.2 Name, Role, Value (A)"],
    tags: ["wcag2a", "wcag111", "wcag412", "cat.text-alternatives"],
  },
  "meta-refresh": {
    impact: "critical",
    help: "Delayed refresh under 20 hours must not be used",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.10/meta-refresh",
    description: 'Ensure <meta http-equiv="refresh"> is not used for delayed refresh',
    fix: "Drop the automatic refresh and let the user trigger the reload, or navigate, themselves. An involuntary refresh under 20 hours can move focus and interrupt anyone reading or filling in a form.",
    before: '<meta http-equiv="refresh" content="5;url=/next">',
    after: '<a href="/next">Continue</a>',
    wcag: ["2.2.1 Timing Adjustable (A)"],
    tags: ["wcag2a", "wcag221", "cat.time-and-media"],
  },
  "meta-viewport": {
    impact: "critical",
    help: "Zooming and scaling must not be disabled",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.10/meta-viewport",
    description: 'Ensure <meta name="viewport"> does not disable text scaling and zooming',
    fix: 'Remove user-scalable="no" from the viewport meta tag, and keep maximum-scale at 2 or higher, so people who rely on zoom can pinch to read.',
    before: '<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">',
    after: '<meta name="viewport" content="width=device-width, initial-scale=1">',
    wcag: ["1.4.4 Resize Text (AA)"],
    tags: ["wcag2aa", "wcag144", "cat.sensory-and-visual-cues"],
  },
  "select-name": {
    impact: "critical",
    help: "Select element must have an accessible name",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.10/select-name",
    description: "Ensure select element has an accessible name",
    fix: "Associate a visible <label> with the <select> via for/id, or give it an aria-label. A <select> with no name is announced as just \"combo box\".",
    before: '<select id="country"><option>UK</option></select>',
    after: '<label for="country">Country</label>\n<select id="country"><option>UK</option></select>',
    wcag: ["4.1.2 Name, Role, Value (A)"],
    tags: ["wcag2a", "wcag412", "cat.forms"],
  },
  "color-contrast": {
    impact: "serious",
    help: "Elements must meet minimum color contrast ratio thresholds",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.10/color-contrast",
    description: "Ensures the contrast between foreground and background colors meets WCAG 2 AA thresholds",
    fix: "Darken the text or lighten the background until the ratio is at least 4.5:1 (3:1 for text 24px+, or 19px bold).",
    before: '<p style="color:#9aa0a6">Subscribe to our newsletter</p>',
    after: '<p style="color:#5f6368">Subscribe to our newsletter</p>',
    wcag: ["1.4.3 Contrast (Minimum) (AA)"],
    tags: ["wcag2aa", "wcag143", "cat.color"],
  },
  "link-name": {
    impact: "serious",
    help: "Links must have discernible text",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.10/link-name",
    description: "Ensures links have discernible text",
    fix: 'Give the link readable text, or an aria-label, so its destination is clear out of context. Avoid "click here".',
    before: '<a href="/report"><svg>…</svg></a>',
    after: '<a href="/report" aria-label="Download the 2026 report"><svg>…</svg></a>',
    wcag: ["4.1.2 Name, Role, Value (A)", "2.4.4 Link Purpose (A)"],
    tags: ["wcag2a", "wcag412", "wcag244", "cat.name-role-value"],
  },
  "html-has-lang": {
    impact: "serious",
    help: "<html> element must have a lang attribute",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.10/html-has-lang",
    description: "Ensures every HTML document has a lang attribute",
    fix: 'Set a valid language on the root element, e.g. <html lang="en">.',
    before: "<html>",
    after: '<html lang="en">',
    wcag: ["3.1.1 Language of Page (A)"],
    tags: ["wcag2a", "wcag311", "cat.language"],
  },
  "document-title": {
    impact: "serious",
    help: "Documents must have a <title> element to aid navigation",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.10/document-title",
    description: "Ensures each HTML document contains a non-empty <title>",
    fix: "Add a concise, descriptive <title> inside <head> that names the page and the site.",
    before: "<head>…</head>",
    after: "<head><title>Pricing — Acme</title>…</head>",
    wcag: ["2.4.2 Page Titled (A)"],
    tags: ["wcag2a", "wcag242", "cat.text-alternatives"],
  },
  "aria-hidden-focus": {
    impact: "serious",
    help: "ARIA hidden element must not be focusable or contain focusable elements",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.10/aria-hidden-focus",
    description: "Ensure aria-hidden elements are not focusable nor contain focusable elements",
    fix: 'Remove aria-hidden="true" from anything focusable, or make its focusable children unreachable too (tabindex="-1", disabled) — otherwise keyboard users tab into content screen readers are told to skip.',
    before: '<div aria-hidden="true"><button>Close</button></div>',
    after: '<div aria-hidden="true"><button tabindex="-1" disabled>Close</button></div>',
    wcag: ["4.1.2 Name, Role, Value (A)"],
    tags: ["wcag2a", "wcag412", "cat.name-role-value"],
  },
  "autocomplete-valid": {
    impact: "serious",
    help: "autocomplete attribute must be used correctly",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.10/autocomplete-valid",
    description: "Ensure the autocomplete attribute is correct and suitable for the form field",
    fix: "Use a valid autocomplete token from the HTML spec that matches what the field collects, e.g. autocomplete=\"email\" rather than a made-up value.",
    before: '<input name="email" autocomplete="mail">',
    after: '<input name="email" autocomplete="email">',
    wcag: ["1.3.5 Identify Input Purpose (AA)"],
    tags: ["wcag21aa", "wcag135", "cat.forms"],
  },
  "frame-title": {
    impact: "serious",
    help: "Frames must have an accessible name",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.10/frame-title",
    description: "Ensure <iframe> and <frame> elements have an accessible name",
    fix: "Give every <iframe>/<frame> a title attribute describing what it contains, so it's not just an unlabeled entry in the screen reader's frame list.",
    before: '<iframe src="/map"></iframe>',
    after: '<iframe src="/map" title="Office location map"></iframe>',
    wcag: ["4.1.2 Name, Role, Value (A)"],
    tags: ["wcag2a", "wcag412", "cat.text-alternatives"],
  },
  "link-in-text-block": {
    impact: "serious",
    help: "Links must be distinguishable without relying on color",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.10/link-in-text-block",
    description: "Ensure links are distinguished from surrounding text in a way that does not rely on color",
    fix: "Give inline links a cue beyond color — an underline is simplest — or push the color contrast against the surrounding text to at least 3:1.",
    before: '<p>Read our <a style="color:#4285f4">privacy policy</a> first.</p>',
    after: '<p>Read our <a style="color:#4285f4; text-decoration:underline">privacy policy</a> first.</p>',
    wcag: ["1.4.1 Use of Color (A)"],
    tags: ["wcag2a", "wcag141", "cat.color"],
  },
  "listitem": {
    impact: "serious",
    help: "<li> elements must be contained in a <ul> or <ol>",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.10/listitem",
    description: "Ensure <li> elements are used semantically",
    fix: "Wrap every <li> directly in a <ul> or <ol> — not on its own, and not inside another wrapper — so screen readers announce it as part of a list.",
    before: '<div class="menu"><li>Home</li></div>',
    after: '<ul class="menu"><li>Home</li></ul>',
    wcag: ["1.3.1 Info and Relationships (A)"],
    tags: ["wcag2a", "wcag131", "cat.structure"],
  },
  "nested-interactive": {
    impact: "serious",
    help: "Interactive controls must not be nested",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.10/nested-interactive",
    description: "Ensure interactive controls are not nested as they are not always announced by screen readers or can cause focus problems for assistive technologies",
    fix: "Don't put one interactive element inside another, like a <button> inside an <a>. Make them siblings instead so focus and activation stay predictable.",
    before: '<a href="/post/1">Read post <button>Save</button></a>',
    after: '<a href="/post/1">Read post</a>\n<button>Save</button>',
    wcag: ["4.1.2 Name, Role, Value (A)"],
    tags: ["wcag2a", "wcag412", "cat.keyboard"],
  },
  "scrollable-region-focusable": {
    impact: "serious",
    help: "Scrollable region must have keyboard access",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.10/scrollable-region-focusable",
    description: "Ensure elements that have scrollable content are accessible by keyboard",
    fix: 'Add tabindex="0" to a scrollable container that has no focusable child, so keyboard users can scroll it without a mouse.',
    before: '<div style="overflow:auto; height:200px">…</div>',
    after: '<div style="overflow:auto; height:200px" tabindex="0">…</div>',
    wcag: ["2.1.1 Keyboard (A)"],
    tags: ["wcag2a", "wcag211", "wcag213", "cat.keyboard"],
  },
  "tabindex": {
    impact: "serious",
    help: "Elements should not have tabindex greater than zero",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.10/tabindex",
    description: "Ensure tabindex attribute values are not greater than 0",
    fix: 'Remove positive tabindex values. If the tab order is wrong, reorder the DOM instead — use tabindex="0" to opt an element in, or "-1" to opt it out, nothing higher.',
    before: '<input tabindex="2">\n<input tabindex="1">',
    after: "<input>\n<input>",
    wcag: ["2.4.3 Focus Order (A)"],
    tags: ["cat.keyboard", "best-practice"],
  },
  "heading-order": {
    impact: "moderate",
    help: "Heading levels should only increase by one",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.10/heading-order",
    description: "Ensures the order of headings is semantically correct",
    fix: "Don’t skip levels. Follow an <h2> with an <h3>, not an <h4>. Style with CSS, not by choosing a bigger tag.",
    before: "<h2>Features</h2>\n<h4>Sync</h4>",
    after: "<h2>Features</h2>\n<h3>Sync</h3>",
    wcag: ["1.3.1 Info and Relationships (A)"],
    tags: ["cat.semantics", "best-practice"],
  },
  "region": {
    impact: "moderate",
    help: "All page content should be contained by landmarks",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.10/region",
    description: "Ensures all page content is contained by landmarks",
    fix: "Wrap stray content in a landmark — <main>, <nav>, <aside> — so assistive tech can navigate by region.",
    before: '<div class="promo">…</div>',
    after: '<aside class="promo" aria-label="Promotion">…</aside>',
    wcag: ["1.3.1 Info and Relationships (A)"],
    tags: ["cat.keyboard", "best-practice"],
  },
  "landmark-one-main": {
    impact: "moderate",
    help: "Document should have one main landmark",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.10/landmark-one-main",
    description: "Ensures the document has a main landmark",
    fix: "Wrap the primary content of the page in a single <main> element.",
    before: '<div id="content">…</div>',
    after: '<main id="content">…</main>',
    wcag: ["1.3.1 Info and Relationships (A)"],
    tags: ["cat.semantics", "best-practice"],
  },
  "list": {
    impact: "moderate",
    help: "Lists must be structured correctly",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.10/list",
    description: "Ensures <ul> and <ol> contain only <li>, <script> or <template>",
    fix: "Only put <li> elements directly inside a <ul>/<ol>. Move wrappers inside the <li>.",
    before: "<ul><div><li>One</li></div></ul>",
    after: "<ul><li><div>One</div></li></ul>",
    wcag: ["1.3.1 Info and Relationships (A)"],
    tags: ["cat.structure", "wcag2a", "wcag131"],
  },
  "page-has-heading-one": {
    impact: "moderate",
    help: "Page should contain a level-one heading",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.10/page-has-heading-one",
    description: "Ensure that the page, or at least one of its frames contains a level-one heading",
    fix: "Give every page a single <h1> naming its main content, ahead of the rest of the heading structure, so screen reader users can jump straight to it.",
    before: "<body><h2>Welcome</h2>…</body>",
    after: "<body><h1>Welcome</h1>…</body>",
    wcag: ["1.3.1 Info and Relationships (A)"],
    tags: ["cat.semantics", "best-practice"],
  },
  "duplicate-id": {
    impact: "minor",
    help: "id attribute values must be unique",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.10/duplicate-id",
    description: "Ensures every id attribute value is unique",
    fix: "Make each id unique on the page. Duplicate ids break label-for and aria references.",
    before: '<input id="email"> … <input id="email">',
    after: '<input id="email-login"> … <input id="email-news">',
    wcag: ["4.1.1 Parsing (A)"],
    tags: ["wcag2a", "wcag411", "cat.parsing"],
  },
  "image-redundant-alt": {
    impact: "minor",
    help: "Alternative text should not be repeated as text",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.10/image-redundant-alt",
    description: "Ensures image alternative text is not repeated as adjacent text",
    fix: 'When the same words sit next to the image, mark the image decorative with alt="".',
    before: '<img src="cart.svg" alt="Cart"> Cart',
    after: '<img src="cart.svg" alt=""> Cart',
    wcag: ["1.1.1 Non-text Content (A)"],
    tags: ["cat.text-alternatives", "best-practice"],
  },
  "empty-heading": {
    impact: "minor",
    help: "Headings should not be empty",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.10/empty-heading",
    description: "Ensure headings have discernible text",
    fix: "Give the heading real text, or remove the heading tag if it was only there for spacing or an icon — an empty heading is a dead end in the screen reader's heading list.",
    before: "<h2></h2>",
    after: "<h2>Latest articles</h2>",
    wcag: ["1.3.1 Info and Relationships (A)"],
    tags: ["cat.name-role-value", "best-practice"],
  },
};

// --------------- Compute helpers (used by Dashboard + Details) -------

export function nodeCount(audit: AuditRecord): number {
  return audit.violations.reduce((sum, v) => sum + v.nodes.length, 0);
}

export function countsByImpact(audits: AuditRecord[]): Record<Impact, number> {
  const c: Record<Impact, number> = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const a of audits) {
    for (const v of a.violations) {
      c[v.impact] += v.nodes.length;
    }
  }
  return c;
}

export function totalViolations(audits: AuditRecord[]): number {
  const c = countsByImpact(audits);
  return c.critical + c.serious + c.moderate + c.minor;
}

export function byRule(audits: AuditRecord[]): RuleRow[] {
  const map = new Map<string, { impact: Impact; help: string; helpUrl: string; count: number; pages: Set<string>; auditId: string }>();
  for (const a of audits) {
    for (const v of a.violations) {
      const cur = map.get(v.id) ?? { impact: v.impact, help: v.help, helpUrl: v.helpUrl, count: 0, pages: new Set<string>(), auditId: a.id };
      cur.count += v.nodes.length;
      cur.pages.add(a.url);
      map.set(v.id, cur);
    }
  }
  return [...map.entries()]
    .map(([ruleId, r]) => ({ ruleId, impact: r.impact, help: r.help, helpUrl: r.helpUrl, count: r.count, pageCount: r.pages.size, auditId: r.auditId }))
    .sort((a, b) => IMPACT_RANK[a.impact] - IMPACT_RANK[b.impact] || b.count - a.count);
}

export function aggregateTrend(audits: AuditRecord[], runDates: string[]): TrendPoint[] {
  return runDates.map((date, i) => ({
    date,
    total: audits.reduce((sum, a) => sum + (a.history[i] ?? 0), 0),
  }));
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    ", " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  );
}

export function relTime(iso: string): string {
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 36e5);
  if (h < 1) return "just now";
  if (h < 24) return `${h} ${h === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(h / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

// --------------- Details helpers -------------------------------------

/** Returns the ruleId of the highest-impact, most-occurring violation on an audit. */
export function defaultRuleId(audit: AuditRecord): string | undefined {
  return [...audit.violations]
    .sort((a, b) => IMPACT_RANK[a.impact] - IMPACT_RANK[b.impact] || b.nodes.length - a.nodes.length)[0]?.id;
}

/**
 * Rule reference for the details page: the hand-written catalogue entry when
 * we have one, otherwise a spec assembled from the violation's own data.
 */
export function ruleSpecFor(violation: Violation): RuleSpec {
  const known = RULES[violation.id];
  if (known) return known;
  return {
    impact: violation.impact,
    help: violation.help,
    helpUrl: violation.helpUrl,
    description: violation.description,
    fix: "Mend doesn't have a hand-written fix for this rule yet. The rule documentation below walks through the failure conditions and how to resolve each one.",
    wcag: violation.tags.filter((t) => /^\d+\.\d+\.\d+$/.test(t)),
    tags: violation.tags,
  };
}
