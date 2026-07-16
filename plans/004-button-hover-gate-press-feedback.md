# 004 — Gate button hover lift behind real hover; add press feedback

- **Status**: DONE
- **Commit**: b5deaa1
- **Severity**: MEDIUM
- **Category**: Accessibility / Physicality
- **Estimated scope**: 1 file (`src/styles/globals.css`), ~15 lines restructured
- **Depends on**: plan 001 (uses `--ease-out`)

## Problem

```css
/* src/styles/globals.css:259-273 — current */
.btn--primary {
  background: var(--accent);
  color: #fff;
  box-shadow: var(--shadow-sm);
}
.btn--primary:hover { background: var(--accent-hover); color: #fff; transform: translateY(-1px); box-shadow: var(--shadow); }
.btn--primary:active { transform: translateY(0); }

.btn--ghost {
  background: var(--raised);
  color: var(--text);
  border-color: var(--border-strong);
}
.btn--ghost:hover { color: var(--text); border-color: var(--accent); background: var(--surface); transform: translateY(-1px); }
```

Two problems:

1. **Ungated hover motion.** Touch devices fire `:hover` on tap and it sticks — tap a button and it stays lifted (and recolored) until focus moves elsewhere. Hover motion must be gated behind `@media (hover: hover) and (pointer: fine)`.
2. **No press feedback on touch.** `.btn--primary:active { transform: translateY(0) }` only cancels the hover lift — on a touch device there is no lift to cancel, so pressing gives zero physical response. `.btn--ghost` has no `:active` at all.

## Target

```css
/* target */
.btn--primary {
  background: var(--accent);
  color: #fff;
  box-shadow: var(--shadow-sm);
}
.btn--ghost {
  background: var(--raised);
  color: var(--text);
  border-color: var(--border-strong);
}
.btn:active { transform: scale(0.97); }

@media (hover: hover) and (pointer: fine) {
  .btn--primary:hover { background: var(--accent-hover); color: #fff; transform: translateY(-1px); box-shadow: var(--shadow); }
  .btn--ghost:hover { color: var(--text); border-color: var(--accent); background: var(--surface); transform: translateY(-1px); }
}
```

Notes on values:

- Press feedback is `scale(0.97)` — subtle, per the 0.95–0.98 range. It rides the `.btn` transition's transform term, which plan 001 sets to `transform 160ms var(--ease-out)` (the 100–160ms press-feedback budget). If plan 001 has not landed, set the `.btn` transition transform term to `transform 160ms cubic-bezier(0.23, 1, 0.32, 1)` yourself as part of this plan.
- `:active` replaces the hover lift while pressed (scale wins over translateY) — that's correct; press should feel like pressing *down*.
- The old `.btn--primary:active { transform: translateY(0); }` line is deleted, replaced by the shared `.btn:active`.

## Repo conventions to follow

- Buttons are defined in the `/* ---- Buttons ---- */` section of `globals.css:240-274`; keep all changes inside it.
- Existing rule style is single-line for state selectors — keep `:hover`/`:active` rules on one line each.
- `.btn--oauth` in `app.css:140-147` inherits `.btn`'s transition and gains the new `.btn:active` press feedback automatically — its hover changes colors only (no transform), so it stays ungated. Do not touch it.

## Steps

1. In `src/styles/globals.css`, delete these two lines (264-265):

   ```css
   .btn--primary:hover { background: var(--accent-hover); color: #fff; transform: translateY(-1px); box-shadow: var(--shadow); }
   .btn--primary:active { transform: translateY(0); }
   ```

   and this line (272):

   ```css
   .btn--ghost:hover { color: var(--text); border-color: var(--accent); background: var(--surface); transform: translateY(-1px); }
   ```

2. After the `.btn--ghost` block (after old line 273's closing brace), add:

   ```css
   .btn:active { transform: scale(0.97); }

   @media (hover: hover) and (pointer: fine) {
     .btn--primary:hover { background: var(--accent-hover); color: #fff; transform: translateY(-1px); box-shadow: var(--shadow); }
     .btn--ghost:hover { color: var(--text); border-color: var(--accent); background: var(--surface); transform: translateY(-1px); }
   }
   ```

3. Confirm the `.btn` transition (globals.css:255) has its transform term at `160ms` with the strong ease-out (see plan 001). If it still reads `transform .12s ease`, change that term to `transform 160ms var(--ease-out)` (token from plan 001) or the literal `cubic-bezier(0.23, 1, 0.32, 1)` if the token doesn't exist yet.

## Boundaries

- Do NOT gate color-only hovers elsewhere (`.site-nav a:hover`, `.footer-links a:hover`, `.pw-toggle:hover`, `.btn--oauth:hover`) — no motion there, out of scope.
- Do NOT change `.mini-btn` — it's a static mockup element in the marketing steps, not a real button.
- Do NOT change markup or TSX.
- If a step doesn't match the code you find (drift since commit b5deaa1), STOP and report instead of improvising.

## Verification

- **Mechanical**: `pnpm build` succeeds. `grep -n "hover: hover" src/styles/globals.css` shows the new media query containing both button hover rules.
- **Feel check**: `pnpm dev`, open `http://localhost:3000`:
  - Desktop: hover the primary CTA — it still lifts 1px with shadow growth; press and hold — it scales down to 0.97 (pressing in, not just dropping back).
  - DevTools device toolbar → emulate a touch device (e.g. iPhone): tap a button — **no lift, no color stick**; while the finger is down it scales to 0.97 and springs back on release.
  - DevTools Animations panel at 10% speed: the press-down feels immediate (starts fast — strong ease-out), release retargets smoothly mid-press if you tap rapidly (transitions, not keyframes, so no restart from zero).
- **Done when**: touch emulation shows no sticky hover, and both button variants give visible press feedback on pointer-down.
