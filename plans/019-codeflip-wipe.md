# 019 — Wipe the codeflip's "After" row in on scroll

- **Status**: DONE
- **Commit**: 88d2ab8
- **Severity**: LOW
- **Category**: Missed opportunities
- **Estimated scope**: 1 file (`src/styles/globals.css`), ~16 lines added
- **Depends on**: 016 (uses `--ease-out` conventions; no `.reveal` class used)

## Problem

The `.codeflip` block is the product's core pitch made visual — "plain-language
docs, before/after code, written by hand" — and it is two motionless rows. The
before/after relationship it exists to dramatise is left entirely to the reader.

```tsx
/* src/routes/index.tsx:142-151 — current */
              <div className="codeflip" aria-hidden="true">
                <div className="codeflip__row codeflip__row--before">
                  <span className="codeflip__tag">Before</span>
                  <span>{'<img src="logo.png">'}</span>
                </div>
                <div className="codeflip__row codeflip__row--after">
                  <span className="codeflip__tag">After</span>
                  <span>{'<img src="logo.png" alt="Mend logo">'}</span>
                </div>
              </div>
```

```css
/* src/styles/globals.css:676-686 — current */
.codeflip {
  margin-top: 1rem;
  border: 1px solid var(--border);
  border-radius: var(--r);
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: .82rem;
  line-height: 1.5;
}
.codeflip__row { display: flex; gap: .5rem; padding: .5rem .7rem; align-items: baseline; }
.codeflip__row--before { background: #fbeeea; color: #7a2417; }
.codeflip__row--after  { background: var(--pass-bg); color: var(--pass-text); }
```

## Target

As the card scrolls into view, the red "Before" row is already there and the
green "After" row **wipes in left-to-right over it**, like the fix being typed
in. One shot, scrubbed by scroll.

```css
/* target — append to the Differentiators section of src/styles/globals.css,
   directly after the .codeflip__tag rule at line 688 */

/* The "After" row wipes in left-to-right as the card enters view: the fix
   arriving, rather than two rows that were always there.
   clip-path is used, not width/height — it composites and never reflows the
   row (the row keeps its layout box at all times, so the block's height is
   stable and nothing below it jumps).
   Scroll-driven and one-shot by design: an auto-playing loop here would be a
   WCAG 2.2.2 (Pause, Stop, Hide) failure — moving content that starts
   automatically and runs past 5s needs a pause control, and aria-hidden does
   not exempt visual motion. On the page that advertises "It passes its own
   audit", that is not a trade worth making. */
@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion: no-preference) {
    .codeflip__row--after {
      animation: codeflip-wipe linear both;
      animation-timeline: view();
      animation-range: entry 50% entry 100%;
    }
    @keyframes codeflip-wipe {
      from { clip-path: inset(0 100% 0 0); }
      to   { clip-path: inset(0 0 0 0); }
    }
  }
}
```

The `entry 50% → entry 100%` range means the wipe starts once the card is
halfway into the viewport and completes exactly as it lands fully in view — so
the wipe is over by the time the reader's eye settles, never mid-stroke while
they read.

## Repo conventions to follow

- Motion gates on `@media (prefers-reduced-motion: no-preference)` inside
  `@supports`. Exemplars: `src/styles/globals.css:400-406` (panel drift) and
  `:577` (`@supports (interpolate-size: allow-keywords)` on the FAQ).
- `linear` for scroll-scrubbed animation — the scroll supplies the pacing.
  Exemplar convention: audit playbook §2, constant/scrubbed motion → linear.
- Codeflip styles live in the `/* Differentiators */` section of `globals.css`
  (starts line 651). Keep the new rule adjacent to the rules it extends.

## Steps

1. In `src/styles/globals.css`, directly after the `.codeflip__tag` rule at
   line 688, insert the `@supports (animation-timeline: view())` block from the
   Target section verbatim, including its full comment.

2. Make no other change. `src/routes/index.tsx` is **not** edited by this plan —
   `.codeflip__row--after` is already in the markup and already `aria-hidden`.

## Boundaries

- Do NOT add `.reveal` to `.codeflip` or `.codeflip__row--after`. Plan 018
  explicitly leaves the codeflip alone; a `.reveal` here would apply a competing
  `transform`/`opacity` animation and the two would fight.
- Do NOT make this loop, cycle, alternate, or auto-play. It is one-shot and
  scroll-driven for the accessibility reason spelled out in the Target comment.
  If asked to make it cycle, STOP and report rather than doing it.
- Do NOT animate `width`, `height`, `max-width` or `margin` to achieve the wipe.
  They reflow; `clip-path` composites.
- Do NOT change the codeflip markup, its `aria-hidden="true"`, or the code
  samples.
- Do NOT touch `.codeflip__row--before`. It is meant to be already-present.
- Do NOT add dependencies or any JS.
- If a step doesn't match the code you find (drift since commit 88d2ab8), STOP
  and report instead of improvising.

## Verification

- **Mechanical**: `pnpm build` succeeds. `grep -n "codeflip-wipe" src/styles/globals.css` shows the animation and the keyframes.
- **Feel check**: `pnpm dev`, open `/` in Chrome, scroll slowly to the "Why Mend"
  section, feature card 2:
  - The green "After" row wipes in from the **left edge to the right**, and is
    fully painted by the time the card is completely in view.
  - The red "Before" row never animates — it's present the whole time.
  - **Watch the block's height and the card below it.** Neither may move or
    jump while the wipe runs. Any reflow means `clip-path` was swapped for a
    layout property — that's a defect, not a style choice.
  - Before the wipe starts, the "After" row's strip is blank (the card's white
    shows through) but the block is already at its final height.
  - Scroll back up: the wipe reverses and tracks the scrollbar. Expected — it's
    scroll-driven, not a one-way trigger.
  - In DevTools → Animations panel at 10% playback, confirm the wipe is a clean
    left-to-right reveal with no fade and no vertical movement.
  - DevTools → Rendering → emulate `prefers-reduced-motion: reduce`, reload:
    both rows are fully visible immediately, exactly as today.
  - **Open `/` in Safari or Firefox** (no scroll-driven animation support at
    time of writing): both rows are fully visible and readable, no wipe. If the
    "After" row is invisible or clipped there, the `@supports` gate is wrong —
    stop and report, it's a release blocker.
- **Done when**: the After row wipes in on scroll in Chrome with zero layout
  shift, and both rows render fully in reduced-motion and non-supporting
  browsers.
