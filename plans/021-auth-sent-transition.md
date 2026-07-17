# 021 — Give the auth "Check your inbox" panel an entrance

- **Status**: DONE
- **Commit**: 88d2ab8
- **Severity**: MEDIUM
- **Category**: Missed opportunities
- **Estimated scope**: 1 file (`src/styles/app.css`), ~9 lines added
- **Depends on**: 016 (uses `--dur-ui`)

## Problem

Submitting the magic-link form on login or signup swaps the entire form out for
a confirmation panel, instantly. One frame you're looking at an email field and
a button; the next, a mail icon and "Check your inbox". Nothing explains that
the panel is a *response* to what you just did — the highest-stakes moment in
the whole auth flow teleports.

`src/components/auth/LoginForm.tsx:74-103` early-returns the panel once `sentTo`
is set (`:71`), replacing the `<form>` returned at `:105`:

```tsx
/* src/components/auth/LoginForm.tsx:74-77 — current */
  if (sentTo) {
    return (
      <div className="auth-sent" role="status" aria-live="polite">
        <span className="auth-sent__ico" aria-hidden="true">
```

`src/components/auth/SignupForm.tsx:76-78` does the identical thing. Both render
`.auth-sent`, whose styles carry no transition at all:

```css
/* src/styles/app.css:153-161 — current */
.auth-sent { text-align: center; padding: .5rem 0 .3rem; }
.auth-sent .auth-sent__ico {
  width: 64px; height: 64px; margin: 0 auto 1.1rem;
  display: grid; place-items: center; border-radius: 50%;
}
.auth-sent h2 { margin-bottom: .4rem; }
.auth-sent p { color: var(--muted); margin-bottom: .3rem; }
.auth-sent .sent-to { color: var(--text); font-weight: 650; }
```

Because both forms share this one class, a single CSS rule fixes both. No
component changes are needed.

## Target

The panel fades and rises 8px into place on mount, via `@starting-style` — no JS,
no state, no `useEffect`.

```css
/* target — replace the .auth-sent rule at src/styles/app.css:153 */
.auth-sent {
  text-align: center;
  padding: .5rem 0 .3rem;
  transition: opacity var(--dur-ui) var(--ease-out),
              transform var(--dur-ui) var(--ease-out);
}
@starting-style {
  .auth-sent {
    opacity: 0;
    transform: translateY(8px);
  }
}
```

**Why 8px and `--dur-ui` (250ms), not the 24px `--rise` and 520ms `--dur-entry`
used on marketing pages.** This is UI responding to a user action, not a
marketing entrance. The audit playbook caps UI animation at 300ms (§2), and the
panel is the system answering a submit — it should snap in confidently. The big
expressive rise would make signing in feel slower than it is.

**Only the entrance animates; the form's exit does not.** The form unmounts the
instant `sentTo` is set, and CSS cannot animate an element React has already
removed. Animating both halves would mean a View Transition or an exit-animation
library — a disproportionate amount of new machinery for one swap, and out of
scope here. The entrance alone is what carries the meaning: it reads as the
panel arriving *because* you submitted.

## Repo conventions to follow

- `@starting-style` for mount entrances is already the house pattern. Exemplar —
  `src/styles/globals.css:626-638`, the API key reveal (plan 006), which is the
  same shape at a 4px rise:

  ```css
  .key-reveal {
    /* … */
    transition: opacity 300ms var(--ease-out), transform 300ms var(--ease-out);
  }
  @starting-style {
    .key-reveal {
      opacity: 0;
      transform: translateY(4px);
    }
  }
  ```

- Auth styles live in `app.css`, not `globals.css` — `.auth-sent` is already
  there at line 153. Keep it in place; do not relocate it.
- No `no-preference` gate is needed here (unlike the marketing entrances): this
  is a `transition`, and the global reduced-motion block at
  `src/styles/globals.css:143-149` forces `transition-duration: .001ms
  !important`, which makes the panel appear instantly and correctly. That rule
  does not neutralise `animation-delay`, which is why plan 016's `.enter` needs
  the gate and this does not.

## Steps

1. In `src/styles/app.css:153`, replace the single-line rule:

   ```css
   .auth-sent { text-align: center; padding: .5rem 0 .3rem; }
   ```

   with the expanded rule plus the `@starting-style` block from the Target
   section verbatim. Leave lines 154-161 (`.auth-sent__ico`, `h2`, `p`,
   `.sent-to`) exactly as they are.

## Boundaries

- Do NOT edit `src/components/auth/LoginForm.tsx` or
  `src/components/auth/SignupForm.tsx`. This is CSS-only and covers both.
- Do NOT touch the `role="status" aria-live="polite"` attributes or the
  `sentHeadingRef` focus effect (`LoginForm.tsx:83`, `SignupForm.tsx:23`).
  Screen-reader announcement and focus management must keep working untouched.
- Do NOT add an exit animation, a View Transition, or an animation library.
- Do NOT add `.enter` or `.reveal` here — those are marketing-page primitives
  with a 24px rise and a 520ms duration, both wrong for this surface.
- Do NOT wrap this in `@media (prefers-reduced-motion: no-preference)`; see the
  conventions note above for why the global rule already handles it.
- Do NOT add dependencies or any JS.
- If a step doesn't match the code you find (drift since commit 88d2ab8), STOP
  and report instead of improvising.

## Verification

- **Mechanical**: `pnpm build` succeeds. `grep -A6 "^.auth-sent {" src/styles/app.css` shows the transition and the `@starting-style` block.
- **Feel check**: `pnpm dev`. The magic-link flow is behind `VITE_AUTH_MAGIC_LINK`
  (see `src/lib/auth-features.ts`); enable it, then on `/login` enter an email and
  submit the magic-link form:
  - The "Check your inbox" panel fades and rises gently into place rather than
    appearing in one frame.
  - It feels *fast* — a beat, not a reveal. If it feels stately, `--dur-ui` was
    swapped for `--dur-entry`.
  - Click "Use a password instead" to go back, then submit again: the entrance
    replays every time the panel mounts.
  - Repeat the whole check on `/signup` — same behaviour, from the same rule.
  - In DevTools → Animations panel at 10% playback, confirm the panel both fades
    **and** rises. A pure fade means the `@starting-style` `transform` isn't
    applying.
  - **With a screen reader (or DevTools → Accessibility pane), confirm "Check
    your inbox" is still announced and that focus lands on the `<h2>`.** The
    transition must not interfere with either — if the announcement is lost, stop
    and report.
  - DevTools → Rendering → emulate `prefers-reduced-motion: reduce`, submit
    again: the panel appears instantly, with no rise and no flash of blank space.
- **Done when**: the panel rises in on both `/login` and `/signup`, focus and the
  live-region announcement still work, and reduced motion shows it instantly.
