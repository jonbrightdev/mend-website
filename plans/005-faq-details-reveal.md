# 005 — Animate the FAQ answer reveal to match its icon

- **Status**: DONE
- **Commit**: b5deaa1
- **Severity**: MEDIUM
- **Category**: Cohesion
- **Estimated scope**: 1 file (`src/styles/globals.css`), ~12 lines added
- **Depends on**: plan 001 (uses `--ease-out`; also retimes the icon to 250ms `--ease-in-out`)

## Problem

The FAQ (`src/routes/support.tsx:46-99`, native `<details>` elements) animates half of one interaction:

```css
/* src/styles/globals.css:544-556 — current (abridged) */
.faq summary .q-icon {
  margin-left: auto;
  flex: none;
  width: 26px; height: 26px;
  display: grid; place-items: center;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent-text);
  transition: transform .2s ease;
  font-size: 1.1rem; line-height: 1;
}
.faq details[open] summary .q-icon { transform: rotate(45deg); }
.faq .faq__body { padding: 0 1.2rem 1.15rem; color: var(--muted); }
```

The `+` icon rotates smoothly over 200ms while the answer body it announces **teleports** open and shut in the same gesture. Animating the ornament but not the content reads as a glitch — the page below the item also jumps as layout reflows instantly.

## Target

Animate the `<details>` content height using `interpolate-size` + `::details-content` — pure CSS, progressive enhancement (this product's audience is Chrome users; other browsers keep today's instant behavior, which is acceptable):

```css
/* target — add after the .faq details[open] rule */
@supports (interpolate-size: allow-keywords) {
  .faq details {
    interpolate-size: allow-keywords;
  }
  .faq details::details-content {
    block-size: 0;
    overflow: clip;
    transition:
      block-size 250ms var(--ease-out),
      content-visibility 250ms allow-discrete;
  }
  .faq details[open]::details-content {
    block-size: auto;
  }
}
```

Values: 250ms sits in the 150–250ms dropdown/expander budget; `--ease-out` = `cubic-bezier(0.23, 1, 0.32, 1)` (entrance/exit of content — starts fast). The icon should be `transition: transform 250ms var(--ease-in-out)` (on-screen morphing) so both halves of the gesture share one 250ms clock — plan 001 step 3 makes that change; if it hasn't landed, make it here.

Interruptibility comes free: these are transitions, so rapid open/close retargets from the current height instead of restarting. Reduced motion is handled by the global kill in `globals.css:140-147` (`transition-duration: .001ms !important` collapses it to instant — correct here, since instant open is the pre-change behavior).

## Repo conventions to follow

- FAQ styles live in the `/* FAQ — native <details>, fully keyboard operable */` section, `globals.css:524-557`. Add the new block at the end of that section, keeping the comment style.
- The FAQ is deliberately native-`<details>`-based for keyboard operability (see the section comment) — the fix must stay CSS-only, no JS, no markup changes.

## Steps

1. In `src/styles/globals.css`, after line 555 (`.faq details[open] summary .q-icon { transform: rotate(45deg); }`) and before the `.faq .faq__body` rule, insert the `@supports (interpolate-size: allow-keywords) { … }` block exactly as shown in **Target**.
2. Verify the `.q-icon` transition reads `transition: transform 250ms var(--ease-in-out);` (plan 001). If it still reads `transition: transform .2s ease;`, change it to `transition: transform 250ms cubic-bezier(0.77, 0, 0.175, 1);` (or the token if it exists).

## Boundaries

- Do NOT convert the FAQ to a JS accordion or touch `src/routes/support.tsx`.
- Do NOT set `interpolate-size` on `:root` — scope it to `.faq details` only.
- Do NOT animate padding/margin — `block-size` (+ `overflow: clip`) only; the `.faq__body` padding lives inside the clipped content and needs no change.
- If a step doesn't match the code you find (drift since commit b5deaa1), STOP and report instead of improvising.

## Verification

- **Mechanical**: `pnpm build` succeeds. In Chrome ≥131, `getComputedStyle(document.querySelector('.faq details')).interpolateSize` reports `allow-keywords` on `/support`.
- **Feel check**: `pnpm dev`, open `http://localhost:3000/support` in current Chrome:
  - Click a question: the answer **slides open over 250ms while the `+` rotates in lockstep** — one gesture, one clock. Items below are pushed down smoothly, not teleported.
  - Spam-click the same summary: the panel reverses mid-motion from its current height — it never snaps closed and replays from zero.
  - Keyboard: Tab to a summary, press Enter — identical behavior.
  - DevTools Rendering panel → emulate `prefers-reduced-motion: reduce`: open/close is instant again (global kill applies) but still functional.
  - Cross-check in Safari or Firefox (or Chrome <131): opens instantly with no clipping or half-open states — graceful degradation.
- **Done when**: in Chrome the body and icon animate together over 250ms and mid-motion reversal is smooth; in non-supporting browsers behavior is identical to before this change.
