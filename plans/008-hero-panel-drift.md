# 008 — Make the hero's "floating" audit panel actually float

- **Status**: DONE
- **Commit**: b5deaa1
- **Severity**: LOW (missed opportunity — additive)
- **Category**: Missed opportunities
- **Estimated scope**: 1 file (`src/styles/globals.css`), ~10 lines added

## Problem

The homepage hero shows Pip above a mock audit panel whose class is literally `panel-mock--float` (`src/routes/index.tsx:84-88`) — but it is fully static:

```css
/* src/styles/globals.css:387-392 — current */
.panel-mock--float {
  position: static;
  width: 100%;
  max-width: 320px;
  margin: -1rem auto 0;
}
```

This is the marketing hero — a rare, first-impression surface where the delight budget applies. A gentle ambient drift would give the illustration life and sell the "companion at your side" character of the product. (This is additive polish; the hero is not broken.)

## Target

A slow, subtle vertical drift on the panel — transform-only, explicitly gated on `prefers-reduced-motion: no-preference` (don't rely on the global kill for an infinite decorative animation: its `animation-iteration-count: 1 !important` would freeze the panel at a -6px offset rather than at rest):

```css
/* target — add after the .panel-mock--float rule */
@media (prefers-reduced-motion: no-preference) {
  .panel-mock--float {
    animation: panel-drift 6s ease-in-out infinite alternate;
  }
  @keyframes panel-drift {
    from { transform: translateY(0); }
    to   { transform: translateY(-6px); }
  }
}
```

Values and reasoning:

- **6s, ±6px**: ambient motion must be slow and small enough that it never competes with the copy. If in doubt, smaller.
- **Built-in `ease-in-out`, not the strong `--ease-in-out` token**: for a symmetric idle loop the gentle built-in curve is right; the strong curve would make it pump. This is a deliberate exception to the token rule — leave the literal.
- **`alternate`**: reverses smoothly at each end — no restart snap (keyframe restart is irrelevant here since nothing interrupts it).
- **Keyframes are acceptable** (vs. the usual transitions-for-interruptibility rule) because this is non-interactive ambient motion.
- `transform` only — compositor-friendly; the panel already carries a `box-shadow: var(--shadow-lg)` that is NOT animated (animating shadows repaints; the static shadow moving with the transform is fine).

## Repo conventions to follow

- Hero styles live under `/* hero art: Pip + floating audit panel */` in `globals.css:369+`; add the block there, after `.panel-mock--float`.
- The responsive override at `globals.css:579` re-declares `.panel-mock--float` for small screens — the animation applies there too; no extra rule needed.

## Steps

1. In `src/styles/globals.css`, after the `.panel-mock--float` rule (lines 387-392), insert the `@media (prefers-reduced-motion: no-preference) { … }` block exactly as shown in **Target**.

## Boundaries

- Do NOT animate Pip (`.hero__pip`) — one gently moving element is charm; two is a screensaver.
- Do NOT animate the panel's shadow, opacity, or margins — `transform: translateY` only.
- Do NOT add an entrance animation in this plan — ambient drift only.
- Do NOT touch `src/routes/index.tsx`.
- If a step doesn't match the code you find (drift since commit b5deaa1), STOP and report instead of improvising.

## Verification

- **Mechanical**: `pnpm build` succeeds.
- **Feel check**: `pnpm dev`, open `http://localhost:3000`:
  - The audit panel drifts up and down ~6px over a 12s round trip. Read the hero headline while it runs — the motion should be **ignorable**; if your eye is pulled to it, it's too fast or too far (report rather than tweak).
  - Direction reversals at top and bottom are smooth, with no snap.
  - DevTools → Performance: the animation runs on the compositor (no layout/paint entries each frame).
  - Rendering panel → `prefers-reduced-motion: reduce`: the panel is perfectly still at its resting position (translateY(0)), not frozen mid-drift.
  - Narrow the window below 720px: drift continues on the stacked mobile layout without overlapping Pip.
- **Done when**: the panel drifts subtly on the desktop and mobile hero, sits at rest under reduced motion, and generates no per-frame layout work.
