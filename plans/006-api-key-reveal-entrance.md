# 006 — Give the API key reveal an entrance

- **Status**: DONE
- **Commit**: b5deaa1
- **Severity**: LOW (missed opportunity — additive)
- **Category**: Missed opportunities
- **Estimated scope**: 1 file (`src/styles/globals.css`), ~10 lines added
- **Depends on**: plan 001 (uses `--ease-out`)

## Problem

Generating an API key is the account page's one high-emotion moment — the key is shown once, ever ("Copy it now — for your security it won't be shown again"). Today the reveal **teleports** in, instantly replacing the Generate button:

```tsx
/* src/components/AccountClient.tsx:86-112 — current (abridged) */
{freshKey ? (
  <div className="key-reveal" role="status" aria-live="polite">
    <p style={{ marginTop: 0 }}>
      <strong>Your new key.</strong> Copy it now — for your security it
      won&apos;t be shown again.
    </p>
    …
  </div>
) : (
  <button className="btn btn--primary" type="button" disabled={pending} onClick={onGenerate}>
    {pending ? "Generating…" : "Generate a key"}
  </button>
)}
```

```css
/* src/styles/globals.css:593-600 — current */
.key-reveal {
  background: var(--raised);
  border: 1px solid var(--border);
  border-radius: var(--r);
  padding: 1.1rem 1.25rem;
  margin: 1.2rem 0;
  max-width: var(--maxw-prose);
}
```

A rare, first-time moment is exactly where the delight budget is allowed — and an abrupt swap also risks the user not noticing the important "shown once" warning.

## Target

A CSS-only entrance via `@starting-style` — fade + 4px rise, 300ms strong ease-out (within the 200–500ms panel budget). No JS, fires automatically when React mounts the element:

```css
/* target — .key-reveal gains a transition; @starting-style provides the entry state */
.key-reveal {
  background: var(--raised);
  border: 1px solid var(--border);
  border-radius: var(--r);
  padding: 1.1rem 1.25rem;
  margin: 1.2rem 0;
  max-width: var(--maxw-prose);
  transition: opacity 300ms var(--ease-out), transform 300ms var(--ease-out);
}
@starting-style {
  .key-reveal {
    opacity: 0;
    transform: translateY(4px);
  }
}
```

Physicality notes: it enters from `opacity: 0` + a small offset — never from `scale(0)` or a pure fade with no transform. Reduced motion: the global kill (`globals.css:140-147`, `transition-duration: .001ms !important`) collapses it to an instant appearance — correct; no extra handling needed. Browsers without `@starting-style` simply show it instantly, as today.

## Repo conventions to follow

- `.key-reveal` styles live under `/* ---- Account / connect extension ---- */` in `globals.css:590+`. Keep the addition inside that section.
- Easing token `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` comes from plan 001; if it hasn't landed, use the literal value.

## Steps

1. In `src/styles/globals.css`, add to the existing `.key-reveal` rule (after the `max-width` line):

   ```css
   transition: opacity 300ms var(--ease-out), transform 300ms var(--ease-out);
   ```

2. Immediately after the `.key-reveal` rule's closing brace, add:

   ```css
   @starting-style {
     .key-reveal {
       opacity: 0;
       transform: translateY(4px);
     }
   }
   ```

## Boundaries

- Do NOT touch `src/components/AccountClient.tsx` — the `role="status"` / `aria-live="polite"` announcement already handles screen readers; this is visual-only.
- Do NOT animate the Generate button's disappearance (exit animations on a conditional React render need JS — out of scope).
- Do NOT animate `height`/`margin` — opacity and transform only.
- If a step doesn't match the code you find (drift since commit b5deaa1), STOP and report instead of improvising.

## Verification

- **Mechanical**: `pnpm build` succeeds.
- **Feel check**: `pnpm dev`, sign in, go to `/account`, click "Generate a key":
  - The key panel fades in and settles upward over ~300ms — it lands crisply (strong ease-out), no drift, no bounce.
  - Click "Done", then generate again: the entrance replays (each mount is a fresh `@starting-style` pass).
  - DevTools Animations panel at 10% speed: motion is opacity + transform only — the panel below it must not reflow during the animation (the element occupies its final layout box from frame one).
  - Rendering panel → `prefers-reduced-motion: reduce`: the panel appears instantly.
- **Done when**: the reveal animates on every generate, is instant under reduced motion, and no layout shift accompanies the entrance.
