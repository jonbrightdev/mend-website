# 002 — Fix the frozen spinner under prefers-reduced-motion

- **Status**: DONE
- **Commit**: b5deaa1
- **Severity**: HIGH
- **Category**: Accessibility
- **Estimated scope**: 1 file (`src/styles/app.css`), ~2 lines changed

## Problem

The global reduced-motion rule in `src/styles/globals.css:140-147` nukes all animation with `!important`:

```css
/* src/styles/globals.css:140-147 — current */
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after {
    animation-duration: .001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .001ms !important;
  }
}
```

`src/styles/app.css:574` *intends* to keep the dashboard loading spinner turning slowly for reduced-motion users:

```css
/* src/styles/app.css:568-574 — current */
.spinner {
  width: 18px; height: 18px; border-radius: 50%;
  border: 2.5px solid var(--border-strong); border-top-color: var(--accent);
  animation: spin .8s linear infinite; flex: none;
}
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spinner { animation-duration: 2s; } }
```

But that override has no `!important`, so the global `!important` rules win (both `animation-duration` and `animation-iteration-count`). The rule is dead code. Under reduced motion, the dashboard's `pendingComponent` (`src/routes/dashboard.tsx:45-48`) shows a **frozen, broken-looking ring** with no indication that anything is loading. Reduced motion means fewer and gentler animations, not zero — a loading indicator that indicates loading is comprehension, not decoration. For a product whose entire pitch is accessibility, this is the highest-leverage fix in the audit.

## Target

The spinner's reduced-motion fallback actually applies: a slow 2s rotation, still infinite.

```css
/* src/styles/app.css — target */
@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation-duration: 2s !important;
    animation-iteration-count: infinite !important;
  }
}
```

(`!important` is required to out-compete the global `!important` universal rule; `.spinner` has higher specificity than `*`, so with both marked `!important` the spinner wins. Both properties must be restored — the global rule also forces `animation-iteration-count: 1`.)

## Repo conventions to follow

- Per-component reduced-motion exceptions already live next to their component in `app.css` — see `src/styles/app.css:565`: `@media (prefers-reduced-motion: reduce) { .sk { animation: none; } }`. Keep the same single-line-media-query style.
- Leave the global kill switch in `globals.css` untouched — it is a deliberate, safe default; exceptions opt out locally.

## Steps

1. In `src/styles/app.css:574`, replace:

   ```css
   @media (prefers-reduced-motion: reduce) { .spinner { animation-duration: 2s; } }
   ```

   with:

   ```css
   @media (prefers-reduced-motion: reduce) {
     .spinner {
       animation-duration: 2s !important;
       animation-iteration-count: infinite !important;
     }
   }
   ```

## Boundaries

- Do NOT modify the global reduced-motion block in `globals.css:140-147`.
- Do NOT touch `.sk` — `animation: none` under reduced motion is correct for a decorative shimmer.
- Do NOT change any markup or TSX.
- If a step doesn't match the code you find (drift since commit b5deaa1), STOP and report instead of improvising.

## Verification

- **Mechanical**: `pnpm build` succeeds. `grep -A3 "prefers-reduced-motion" src/styles/app.css` shows the spinner rule with both `!important` declarations.
- **Feel check**: `pnpm dev`, open DevTools → Rendering panel → "Emulate CSS media feature prefers-reduced-motion: reduce". Navigate to `/dashboard` (throttle the network to Slow 3G to hold the pending state):
  - The spinner rotates — slowly, one turn every 2 seconds — instead of sitting frozen.
  - The skeleton blocks (`.sk`) do NOT shimmer (still correctly disabled).
  - Turn emulation off: spinner returns to the fast 0.8s rotation.
- **Done when**: the spinner visibly rotates at 2s/turn with reduced motion emulated, and at 0.8s/turn without.
