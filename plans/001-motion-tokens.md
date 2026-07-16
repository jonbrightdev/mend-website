# 001 — Add motion tokens to the design system

- **Status**: DONE
- **Commit**: b5deaa1
- **Severity**: LOW (but foundational — plans 004, 005, 006, 007, 008 consume these tokens)
- **Category**: Cohesion & tokens
- **Estimated scope**: 1 file (`src/styles/globals.css`), ~10 lines added, 2 lines changed

## Problem

The design system tokenizes color, type, radius, and shadow, but not motion. Every easing in the codebase is a hand-typed CSS built-in, which is too weak for deliberate UI motion:

```css
/* src/styles/globals.css:255 — current (.btn) */
transition: transform .12s ease, box-shadow .15s ease, background .15s ease, border-color .15s ease;
```

```css
/* src/styles/globals.css:552-553 — current (.faq summary .q-icon, abridged) */
transition: transform .2s ease;
```

There is no shared curve for entrances or on-screen movement, so every later motion fix would hand-type its own cubic-bezier — the exact drift the token system exists to prevent.

## Target

Two strong easing tokens in `:root`, next to the existing token groups:

```css
/* Motion */
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);      /* entrances, exits, transforms */
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);  /* moving/morphing on screen */
```

And the two existing *movement* transitions migrated to them. Color/shadow transitions keep the built-in `ease` — that is the correct curve for hover color changes and is not a finding.

## Repo conventions to follow

- Tokens live in the `:root` block of `src/styles/globals.css:8-55`, organized under comment headings (`/* Surfaces */`, `/* Radius */`, `/* Shadows — warm-tinted */`…). Add a `/* Motion */` group after the `/* Shadows — warm-tinted */` group (after line 50, before `/* Layout */`).
- `src/styles/app.css` extends these tokens (see its `:root` at app.css:8-13) — do not duplicate the tokens there; globals.css loads first.

## Steps

1. In `src/styles/globals.css`, inside `:root`, after the `--shadow-lg` line (line 50) and before the `/* Layout */` comment, insert:

   ```css
   /* Motion */
   --ease-out: cubic-bezier(0.23, 1, 0.32, 1);      /* entrances, exits, transforms */
   --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);  /* moving/morphing on screen */
   ```

2. In `src/styles/globals.css:255`, change the `.btn` transition so only the transform term changes:

   ```css
   transition: transform 160ms var(--ease-out), box-shadow .15s ease, background .15s ease, border-color .15s ease;
   ```

3. In `src/styles/globals.css:552-553`, in `.faq summary .q-icon`, change:

   ```css
   transition: transform .2s ease;
   ```

   to:

   ```css
   transition: transform 250ms var(--ease-in-out);
   ```

## Boundaries

- Do NOT touch `.sk` (app.css:560) or `.spinner` (app.css:568-573) — the shimmer's `ease` and the spinner's `linear` are already correct.
- Do NOT touch the skip link (globals.css:128) — plan 003 deletes that transition entirely.
- Do NOT change any markup, TSX, or non-motion CSS.
- Do NOT add new dependencies.
- If a step doesn't match the code you find (drift since commit b5deaa1), STOP and report instead of improvising.

## Verification

- **Mechanical**: `pnpm typecheck` passes (no TS surface touched, so this is a smoke check). `grep -n "cubic-bezier" src/styles/globals.css` shows exactly the two token definitions; `grep -rn "cubic-bezier" src/styles/app.css` shows none.
- **Feel check**: `pnpm dev`, open `http://localhost:3000`:
  - Hover the "Add Mend" primary button: the 1px lift now settles crisply instead of drifting (strong ease-out decelerates hard at the end).
  - On `/support`, open an FAQ item: the `+` icon's 45° rotation eases in and out of the turn.
- **Done when**: both tokens exist in `:root`, both call sites reference them, and no visual regression on buttons or FAQ icons.
