# 018 — Reveal the home page's feature cards and steps on scroll

- **Status**: DONE
- **Commit**: 88d2ab8
- **Severity**: MEDIUM
- **Category**: Missed opportunities
- **Estimated scope**: 2 files (`src/routes/index.tsx`, `src/styles/globals.css`), ~11 lines changed / ~12 added
- **Depends on**: 016 (uses `.reveal`, `.reveal-group`)

## Problem

Everything below the home fold is static. The four "What makes Mend different"
cards (`src/routes/index.tsx:126-180`) and the three "How it works" steps
(`src/routes/index.tsx:195-242`) are simply *there* the instant you scroll to
them — seven cards, no motion, no sense that content is arriving.

This is the largest single motion gap on the site: seven sibling elements in two
groups, which is precisely the shape the audit playbook names as a stagger
opportunity (§7: "everything-at-once group entrances where a 30–80ms stagger
belongs").

Current markup, verbatim:

```tsx
/* src/routes/index.tsx:126-134 — current */
          <div className="feature-grid" style={{ marginTop: "2rem" }}>
            <div className="feature">
              <span className="feature__num" aria-hidden="true">1</span>
              <h3>The fix comes first</h3>
```

```tsx
/* src/routes/index.tsx:195-201 — current */
          <ol
            className="steps"
            style={{ marginTop: "2rem", listStyle: "none", padding: 0 }}
          >
            <li className="step">
              <span className="step__n">Step 01</span>
```

## Target

Both groups carry `.reveal-group`; each card carries `.reveal`. Each card rises
24px and scales from 0.96 as it scrolls into view, staggered by scroll position.
Both section heads (eyebrow / h2 / lede) reveal too, so the heading leads its
cards in rather than the cards appearing under a static title.

Plus one correction the shared primitive can't know about.

**The feature grid needs a per-row stagger reset.** `.feature-grid` is 2-up at
≥720px (`src/styles/globals.css:663`), so cards 3 and 4 sit on the *second row*.
The shared stagger in plan 016 pushes `nth-child(3)` and `nth-child(4)` to later
scroll ranges — which on a single row is exactly right, but on a second row
compounds with the fact that that row already enters the viewport later. The
result reads as a lag, not a stagger. Reset row two to row one's ranges:

```css
/* target — append to the "Differentiators" section of src/styles/globals.css,
   after the .feature-grid rule at lines 656-660 */

/* .feature-grid is 2-up at ≥720px, so cards 3–4 form a second row. The shared
   .reveal-group stagger (plan 016) assumes one row and would compound row two's
   already-later viewport entry into a visible lag. Restart the stagger per row.
   Below 720px the grid is 1-up, where the shared 1→4 stagger is correct. */
@media (min-width: 720px) {
  @supports (animation-timeline: view()) {
    @media (prefers-reduced-motion: no-preference) {
      .feature-grid > .reveal:nth-child(3) { animation-range: entry 15% cover 30%; }
      .feature-grid > .reveal:nth-child(4) { animation-range: entry 15% cover 36%; }
    }
  }
}
```

`.steps` is 3-up in a single row at ≥720px and 1-up below, so the shared
1→2→3 stagger is correct there at every breakpoint. It needs no override.

## Repo conventions to follow

- Section-scoped styles live under their section comment in `globals.css` —
  `/* Differentiators */` at line 651, `/* How it works */` at line 691. Put the
  override under the former.
- Motion gates on `@media (prefers-reduced-motion: no-preference)` inside
  `@supports`. Exemplars: `src/styles/globals.css:400-406` and `:577`.
- Existing breakpoints are `720px` and `900px` (`src/styles/globals.css:662-670`).
  Reuse `720px` — do not invent a new one.

## Steps

1. In `src/routes/index.tsx:120-123`, add `reveal` to the differentiators
   section head — the eyebrow, the h2 and the lede:

   ```tsx
   <p className="eyebrow reveal">Why Mend</p>
   <h2 id="diff-h" className="reveal">What makes Mend different</h2>
   <p className="lede reveal">
   ```

2. In `src/routes/index.tsx:126`, add `reveal-group` to the grid:

   ```tsx
   <div className="feature-grid reveal-group" style={{ marginTop: "2rem" }}>
   ```

3. In `src/routes/index.tsx`, add `reveal` to each of the four feature cards —
   at lines 127, 135, 153 and 161:

   ```tsx
   <div className="feature reveal">
   ```

   All four are `<div className="feature">` today; there must be exactly four
   after this step.

4. In `src/routes/index.tsx:192-193`, add `reveal` to the how-it-works head:

   ```tsx
   <p className="eyebrow reveal">How it works</p>
   <h2 id="how-h" className="reveal">Three steps, then a to-do list</h2>
   ```

5. In `src/routes/index.tsx:195-198`, add `reveal-group` to the steps list:

   ```tsx
   <ol
     className="steps reveal-group"
     style={{ marginTop: "2rem", listStyle: "none", padding: 0 }}
   >
   ```

6. In `src/routes/index.tsx`, add `reveal` to each of the three steps — at lines
   199, 215 and 228:

   ```tsx
   <li className="step reveal">
   ```

7. In `src/styles/globals.css`, after the `.feature-grid` rule (lines 656-660),
   insert the `@media (min-width: 720px)` override block from the Target section
   verbatim, including its comment.

## Boundaries

- Do NOT add `.reveal` to `.codeflip` (inside feature card 2) — it gets its own
  treatment in plan 019, and a `.reveal` on it would fight that plan's wipe.
- Do NOT add `.reveal` to anything in the hero — that's plan 017.
- Do NOT convert the inline `style={{ marginTop: "2rem" }}` props to classes, or
  otherwise tidy the markup. Class attributes only.
- Do NOT change the heading text, `id`s, `aria-labelledby` targets, or the
  `<ol>`/`<li>` structure — the steps are an ordered list for a reason.
- Do NOT add a stagger override for `.steps`; its single row is already correct.
- Do NOT add dependencies or any JS.
- If a step doesn't match the code you find (drift since commit 88d2ab8), STOP
  and report instead of improvising.

## Verification

- **Mechanical**: `pnpm generate-routes && pnpm typecheck && pnpm build` all pass.
  `grep -c "reveal" src/routes/index.tsx` returns 12 (2 groups + 7 cards + 3
  section-head elements... counting: 5 head elements, 7 cards, 2 groups = 14
  class additions across 12 lines — the exact count matters less than: four
  `.feature reveal`, three `.step reveal`, two `reveal-group`).
- **Feel check**: `pnpm dev`, open `/` in Chrome and scroll down slowly:
  - The section heading leads; its cards follow. If cards beat the heading in,
    step 1 or 4 was missed.
  - Feature cards rise **and** fade — a pure fade means `--rise` isn't
    resolving (check plan 016 landed).
  - **Widen the window past 720px** and scroll: row one (cards 1–2) staggers
    left-to-right, then row two (cards 3–4) staggers left-to-right on its own.
    Row two must not feel like it's dragging behind — if card 4 arrives
    conspicuously late, the step-7 override didn't apply.
  - **Narrow below 720px** and scroll: the grid is 1-up and cards reveal one at
    a time in order.
  - The three steps stagger left-to-right across their row.
  - Scroll *back up*: the cards animate in reverse, tracking the scrollbar
    exactly. This is the tell that it's genuinely scroll-driven rather than a
    one-shot — expected and correct.
  - Scroll fast: nothing is left stuck at partial opacity.
  - DevTools → Rendering → emulate `prefers-reduced-motion: reduce`, reload:
    every card is fully visible immediately and nothing moves while scrolling.
  - **Open `/` in Safari or Firefox** (no scroll-driven animation support at
    time of writing): every card must be fully visible and readable, with no
    reveal. If any content is invisible there, the `@supports` gate is wrong and
    this is a release blocker — stop and report.
- **Done when**: both groups stagger in on scroll in Chrome, row two of the
  feature grid restarts its stagger rather than lagging, and all seven cards
  render normally in both reduced-motion and non-supporting browsers.
