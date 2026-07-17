# 017 — Stagger the home hero's entrance and drift its art on scroll

- **Status**: DONE
- **Commit**: 88d2ab8
- **Severity**: MEDIUM
- **Category**: Missed opportunities
- **Estimated scope**: 2 files (`src/routes/index.tsx`, `src/styles/globals.css`), ~8 lines changed / ~14 added
- **Depends on**: 016 (uses `.enter`, `--rise`, `--ease-out`, `--dur-entry`)

## Problem

The home hero is the first thing every visitor sees, and it arrives all at once,
fully-formed and motionless. Eyebrow, headline, sub-paragraph, both CTAs, the
trust note and the art all paint in the same frame.

A first visit is the single place the audit playbook explicitly allows a delight
budget (§1: "Rare / first-time → can add delight"). Right now the hero spends
none of it. The only motion in the entire hero is the panel's 6px drift
(`src/styles/globals.css:400-406`).

Current markup, verbatim — note that not one element carries a motion class:

```tsx
/* src/routes/index.tsx:21-33 — current */
      <section className="hero" aria-labelledby="hero-h">
        <div className="wrap hero__grid">
          <div className="hero__copy">
            <p className="eyebrow">Accessibility auditor for Chrome</p>
            <h1 id="hero-h">
              Find what&apos;s broken on your page, and exactly how to fix it.
            </h1>
            <p className="hero__sub">
              A friendly accessibility auditor for Chrome that scans the active
              tab against WCAG and shows you what&apos;s wrong, where it lives,
              and how to fix it — in plain language.
            </p>
            <div className="hero__cta">
```

```tsx
/* src/routes/index.tsx:74-75 — current */
          <div className="hero__art">
            <div className="hero__art-inner">
```

## Target

The hero's five copy elements enter in reading order, 80ms apart, each rising
24px and scaling from 0.96 — and the art drifts upward as the page scrolls away.

Reading order and stagger step:

| Element | Class | Delay |
| --- | --- | --- |
| `.eyebrow` | `enter enter--1` | 0ms |
| `h1#hero-h` | `enter enter--2` | 80ms |
| `.hero__art` | `enter enter--2` | 80ms (arrives with the headline) |
| `.hero__sub` | `enter enter--3` | 160ms |
| `.hero__cta` | `enter enter--4` | 240ms |
| `.hero__note` | `enter enter--5` | 320ms |

The art shares the headline's beat rather than trailing the copy — it is the
visual anchor of the composition, and holding it to last (400ms) leaves an
obvious hole on the right half of the fold.

Scroll parallax on the art:

```css
/* target — append to the hero art section of src/styles/globals.css,
   directly after the .panel-mock--float drift block that ends at line 406 */
@supports (animation-timeline: scroll()) {
  @media (prefers-reduced-motion: no-preference) {
    .hero__art-inner {
      animation: hero-parallax linear both;
      animation-timeline: scroll(root block);
      animation-range: 0 70vh;
    }
    @keyframes hero-parallax {
      from { transform: translateY(0); }
      to   { transform: translateY(-32px); }
    }
  }
}
```

**Why these three transforms don't collide.** The hero art is three nested
elements and each owns exactly one animation — this is deliberate, do not
consolidate them:

- `.hero__art` — the `.enter` entrance (ends at `transform: none`)
- `.hero__art-inner` — the scroll parallax (this plan)
- `.panel-mock--float` — the existing 6px drift (`globals.css:400-406`)

Putting any two on the same element would make the later `transform` silently
win and one animation would vanish.

## Repo conventions to follow

- Scroll/decorative motion is gated on `@media (prefers-reduced-motion:
  no-preference)`, and progressive enhancement goes through `@supports`.
  Exemplars: `src/styles/globals.css:400-406` (drift) and
  `src/styles/globals.css:577` (`@supports (interpolate-size: allow-keywords)`).
- Hero art styles live in the `/* hero art: Pip + floating audit panel */`
  section of `globals.css`, starting at line 393. Keep the new rule there, next
  to the drift it sits beside.
- `linear` is correct for the parallax: it is scrubbed by scroll position, so
  the scroll supplies the pacing (audit playbook §2 — constant motion → linear).

## Steps

1. In `src/routes/index.tsx:24`, add the entrance class to the eyebrow:

   ```tsx
   <p className="eyebrow enter enter--1">Accessibility auditor for Chrome</p>
   ```

2. In `src/routes/index.tsx:25`, add to the headline:

   ```tsx
   <h1 id="hero-h" className="enter enter--2">
   ```

3. In `src/routes/index.tsx:28`, add to the sub-paragraph:

   ```tsx
   <p className="hero__sub enter enter--3">
   ```

4. In `src/routes/index.tsx:33`, add to the CTA row:

   ```tsx
   <div className="hero__cta enter enter--4">
   ```

5. In `src/routes/index.tsx:54`, add to the trust note:

   ```tsx
   <p className="hero__note enter enter--5">
   ```

6. In `src/routes/index.tsx:74`, add to the art wrapper:

   ```tsx
   <div className="hero__art enter enter--2">
   ```

7. In `src/styles/globals.css`, directly after the `.panel-mock--float` drift
   block closing at line 406, insert the `@supports (animation-timeline:
   scroll())` block from the Target section verbatim.

## Boundaries

- Do NOT add `.enter` to `.hero__art-inner` or `.panel-mock--float` — they carry
  the parallax and the drift respectively, and a second `transform` animation
  would clobber one of them.
- Do NOT touch the existing `panel-drift` keyframes or the `.hero__pip` filter.
- Do NOT animate any element below the fold in this plan — the feature grid and
  steps are plan 018.
- Do NOT change hero copy, structure, `aria-*` attributes, or the SVG icons.
  Class attributes only.
- Do NOT add dependencies or any JS.
- If a step doesn't match the code you find (drift since commit 88d2ab8), STOP
  and report instead of improvising.

## Verification

- **Mechanical**: `pnpm generate-routes && pnpm typecheck && pnpm build` all pass.
  `grep -n "enter--" src/routes/index.tsx` shows exactly five hero elements plus
  the art (six matches, delays 1,2,2,3,4,5).
- **Feel check**: `pnpm dev`, hard-reload `/`:
  - Copy enters top-to-bottom in reading order — eyebrow first, trust note last;
    the whole sequence is done in well under a second (320ms delay + 520ms).
  - The art arrives with the headline, not after the note. If the right half of
    the fold sits empty while the copy finishes, the art's delay is wrong.
  - Nothing overshoots or bounces — `--ease-out` is a decelerate curve, not a
    spring.
  - In DevTools → Animations panel, set playback speed to 10% and reload:
    confirm each element both fades **and** rises (a pure fade means `--rise`
    isn't resolving), and that the stagger is visible rather than everything
    moving in lockstep.
  - Scroll down slowly: the Pip + panel group drifts up ~32px relative to the
    copy, and the panel keeps its own gentle 6px drift on top. Scroll back up:
    the parallax tracks the scroll exactly, with no lag or easing.
  - DevTools → Rendering → emulate `prefers-reduced-motion: reduce`, reload:
    the hero appears instantly and completely, with **no** stagger and **no**
    flash of invisible copy, and the art does not parallax on scroll.
  - In a browser without scroll-driven animation support (Safari or Firefox at
    time of writing), the hero still staggers on load (that's a plain
    time-based animation) and the art simply doesn't parallax. Nothing is
    hidden or broken.
- **Done when**: the hero staggers in reading order on load, the art parallaxes
  on scroll in Chrome, and reduced-motion shows the complete hero instantly.
