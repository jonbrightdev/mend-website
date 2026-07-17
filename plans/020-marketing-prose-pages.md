# 020 — Animate the support and privacy page entrances

- **Status**: DONE
- **Commit**: 88d2ab8
- **Severity**: LOW
- **Category**: Missed opportunities
- **Estimated scope**: 2 files (`src/routes/support.tsx`, `src/routes/privacy.tsx`), ~13 lines changed
- **Depends on**: 016 (uses `.enter`, `.reveal`, `.reveal-group`)

## Problem

Support and privacy both open with a static `.page-head` and then a wall of
motionless content. Neither page has a single animation on it today (the FAQ's
open/close reveal from plan 005 fires only on click, and the site-wide
`--ease-*` tokens are otherwise unused here).

```tsx
/* src/routes/support.tsx:29-32 — current */
      <div className="wrap page-head">
        <p className="eyebrow">Help</p>
        <h1>Support</h1>
        <p className="lede">
```

```tsx
/* src/routes/privacy.tsx:28-32 — current */
      <div className="wrap page-head">
        <p className="eyebrow">Legal</p>
        <h1>Privacy Policy</h1>
        <p className="lede">The short version: nothing leaves your device.</p>
        <p className="page-meta">Effective date: {site.privacyEffectiveDate}</p>
```

## Target

Both page heads stagger in on load, matching the home hero's rhythm. On support,
the four FAQ items stagger in on scroll and the "Still stuck?" contact card
reveals. On privacy, only the `.callout` reveals.

**The prose body is deliberately left static, on both pages.** This is the one
place the "expressive" brief gets dialled back, and it is a considered call, not
an oversight: privacy is a legal document and support is reference material.
People *read* these pages rather than being sold by them, and text that fades
and slides while you are trying to read it is actively hostile — it delays the
words at the exact moment the reader wants them. Revealing seven `<h2>` sections
and their paragraphs on the privacy page would make it feel slow and cheap. The
page head is the greeting and gets the motion; the content is the content.

Support (`src/routes/support.tsx`):

| Element | Line | Class |
| --- | --- | --- |
| `.eyebrow` | 30 | `eyebrow enter enter--1` |
| `h1` | 31 | `enter enter--2` |
| `.lede` | 32 | `lede enter enter--3` |
| CTA `<a>`'s wrapper | 36 | `enter enter--4` |
| `.faq` | 50 | `faq reveal-group` |
| each `<details>` (×4) | 51, 64, 78, 90 | `reveal` |
| `.support-contact` | 101 | `support-contact reveal` |

Privacy (`src/routes/privacy.tsx`):

| Element | Line | Class |
| --- | --- | --- |
| `.eyebrow` | 29 | `eyebrow enter enter--1` |
| `h1` | 30 | `enter enter--2` |
| `.lede` | 31 | `lede enter enter--3` |
| `.page-meta` | 32 | `page-meta enter enter--4` |
| `.callout` | 53 | `callout reveal` |

No CSS changes — plans 016 and 018 already define everything used here. The
`.faq` is `display: grid` (`src/styles/globals.css:551`) with the four
`<details>` as direct children, so the `.reveal-group > .reveal:nth-child(n)`
stagger from plan 016 applies to it unmodified. It is a single column at every
breakpoint, so it needs none of the per-row reset that plan 018 added for
`.feature-grid`.

## Repo conventions to follow

- `.enter` for above-the-fold on-load entrances, `.reveal` for below-the-fold
  scroll reveals, `.reveal-group` on the parent of a staggered set — all defined
  in `src/styles/globals.css` by plan 016.
- The home hero (plan 017) staggers eyebrow → h1 → lede in exactly this order.
  Match it so the three marketing pages share one rhythm.
- Class attributes only; these routes carry no motion CSS of their own.

## Steps

1. In `src/routes/support.tsx:30-32`, add the entrance classes to the page head:

   ```tsx
   <p className="eyebrow enter enter--1">Help</p>
   <h1 className="enter enter--2">Support</h1>
   <p className="lede enter enter--3">
   ```

2. In `src/routes/support.tsx`, find the element wrapping the
   `<a className="btn btn--primary btn--lg" …>` at line 37 (its parent
   container, around line 36) and add `enter enter--4` to that wrapper's
   `className`. If the `<a>` has no wrapping element, add `enter enter--4` to
   the `<a>`'s own `className` instead, after `btn--lg`.

3. In `src/routes/support.tsx:50`, add the group class to the FAQ:

   ```tsx
   <div className="faq reveal-group">
   ```

4. In `src/routes/support.tsx`, add `reveal` to each of the four `<details>`
   elements at lines 51, 64, 78 and 90. They are bare `<details>` today, so each
   becomes:

   ```tsx
   <details className="reveal">
   ```

   There must be exactly four after this step.

5. In `src/routes/support.tsx:101`, add `reveal` to the contact card:

   ```tsx
   <div className="support-contact reveal">
   ```

6. In `src/routes/privacy.tsx:29-32`, add the entrance classes to the page head:

   ```tsx
   <p className="eyebrow enter enter--1">Legal</p>
   <h1 className="enter enter--2">Privacy Policy</h1>
   <p className="lede enter enter--3">The short version: nothing leaves your device.</p>
   <p className="page-meta enter enter--4">Effective date: {site.privacyEffectiveDate}</p>
   ```

7. In `src/routes/privacy.tsx:53`, add `reveal` to the callout:

   ```tsx
   <div className="callout reveal">
   ```

## Boundaries

- Do NOT add `.reveal` or `.enter` to any `<h2>`, `<p>`, `<li>` or `<div>` inside
  `.prose` on either page, beyond the single `.callout` named in step 7. The
  reading body stays static — see the Target section for why. If this looks like
  an omission to correct, it is not.
- Do NOT touch the FAQ's open/close motion (`src/styles/globals.css:567-586`) or
  the `.q-icon` rotate. That is plan 005's work and it is correct.
- Do NOT add `.reveal` to `.faq__body` or `<summary>` — only the `<details>`
  elements themselves.
- Do NOT change copy, `id`s, `aria-labelledby` targets, `site.*` references, or
  the `<details>`/`<summary>` structure.
- Do NOT edit any CSS file — every class used here already exists.
- Do NOT add dependencies or any JS.
- If a step doesn't match the code you find (drift since commit 88d2ab8), STOP
  and report instead of improvising.

## Verification

- **Mechanical**: `pnpm generate-routes && pnpm typecheck && pnpm build` all pass.
  `grep -c "reveal" src/routes/support.tsx` returns 6 (1 group + 4 details + 1
  contact card). `grep -c "enter--" src/routes/privacy.tsx` returns 4.
- **Feel check**: `pnpm dev`, hard-reload `/support` in Chrome:
  - The page head staggers eyebrow → h1 → lede → button, and it feels like the
    same page as the home hero. If the rhythm reads differently, a delay class
    is out of order.
  - Scroll to the FAQ: the four items stagger in top-to-bottom.
  - Click a `<details>` **while its reveal is still mid-flight** — it must open
    normally, at full height, with the `+` rotating to `×`. The scroll reveal
    must never swallow or block the click.
  - The "Still stuck?" card with Pip reveals as it enters.
  - Hard-reload `/privacy`: the head staggers, the callout reveals on scroll,
    and **the seven prose sections do not animate at all**. Scroll through the
    whole document and confirm the body text is perfectly still — if headings
    are fading in as you read, step 6 was over-applied.
  - DevTools → Rendering → emulate `prefers-reduced-motion: reduce`, reload
    both pages: everything is fully visible immediately, no stagger, no flash.
  - **Open both pages in Safari or Firefox**: all FAQ items, the contact card
    and the callout must be fully visible. Any invisible content there means the
    `@supports` gate in plan 016 is broken — stop and report.
- **Done when**: both page heads stagger on load, the support FAQ and contact
  card reveal on scroll, the privacy prose body remains completely static, and
  every page renders fully in reduced-motion and non-supporting browsers.
