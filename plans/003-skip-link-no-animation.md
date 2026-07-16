# 003 — Remove the skip link's focus animation

- **Status**: DONE
- **Commit**: b5deaa1
- **Severity**: HIGH
- **Category**: Purpose & frequency
- **Estimated scope**: 1 file (`src/styles/globals.css`), 1 line removed

## Problem

```css
/* src/styles/globals.css:117-130 — current */
.skip-link {
  position: absolute;
  left: 12px;
  top: -60px;
  z-index: 100;
  background: var(--text);
  color: var(--surface);
  padding: .65rem 1rem;
  border-radius: var(--r-sm);
  font-weight: 600;
  text-decoration: none;
  transition: top .15s ease;
}
.skip-link:focus { top: 12px; color: var(--surface); }
```

The skip link slides in over 150ms when it receives keyboard focus. This fails the frequency test twice over:

- It is a **keyboard-initiated action** — those should never animate. The user pressed Tab and is waiting to read the link; the animation delays the exact moment they're watching.
- It is hit on the **first Tab of every page** by keyboard users — this product's core audience.

It also animates `top`, a layout property, and uses bare `ease` on an entrance. But the right fix is not a better curve — it's **no animation**.

## Target

```css
/* src/styles/globals.css — target: .skip-link block with the transition line deleted */
.skip-link {
  position: absolute;
  left: 12px;
  top: -60px;
  z-index: 100;
  background: var(--text);
  color: var(--surface);
  padding: .65rem 1rem;
  border-radius: var(--r-sm);
  font-weight: 600;
  text-decoration: none;
}
.skip-link:focus { top: 12px; color: var(--surface); }
```

The link appears instantly on focus and disappears instantly on blur.

## Repo conventions to follow

- The dashboard's high-frequency controls (`.segmented`, `.fchip` in `src/styles/app.css`) already give instant state feedback with no transition — this change brings the skip link in line with that instinct.

## Steps

1. In `src/styles/globals.css`, delete line 128 (`transition: top .15s ease;`) from the `.skip-link` rule. Change nothing else in the block.

## Boundaries

- Do NOT reposition the link or change its off-screen technique — `top: -60px` → `top: 12px` on focus is fine once it's instant.
- Do NOT touch `.skip-link:focus` or the focus-visible outline rules at globals.css:110-114.
- Do NOT change any markup or TSX.
- If a step doesn't match the code you find (drift since commit b5deaa1), STOP and report instead of improvising.

## Verification

- **Mechanical**: `pnpm build` succeeds. `grep -n "transition" src/styles/globals.css` no longer lists a `.skip-link` line.
- **Feel check**: `pnpm dev`, open `http://localhost:3000`, click the address bar, then press Tab once:
  - "Skip to main content" appears **instantly**, fully legible on the first frame — no slide, no fade.
  - Press Tab again: it vanishes instantly.
- **Done when**: the skip link snaps in and out with zero transition.
