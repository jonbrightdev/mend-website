# 016 — Add entrance & scroll-reveal motion primitives

- **Status**: DONE
- **Commit**: 88d2ab8
- **Severity**: MEDIUM
- **Category**: Cohesion & tokens
- **Estimated scope**: 1 file (`src/styles/globals.css`), ~55 lines added

## Problem

The site has motion tokens (`src/styles/globals.css:52-54`) but no shared way to
make anything *enter*. Every page renders fully-formed: the home hero snaps in on
load, and nothing anywhere reveals on scroll. There is no `IntersectionObserver`
and no `animation-timeline` in `src/`.

Plans 017–022 each need the same two primitives (an on-load entrance and a
scroll reveal). Without a shared definition they would each hand-roll a
near-identical keyframe — which is exactly the consolidation finding in the audit
playbook (§7: "five hand-typed cubic-beziers that almost match").

Current motion tokens, verbatim:

```css
/* src/styles/globals.css:52-54 — current */
  /* Motion */
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);      /* entrances, exits, transforms */
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);  /* moving/morphing on screen */
```

## Target

Two duration/distance tokens plus two reusable primitives — `.enter` (on-load,
above the fold) and `.reveal` (scroll-driven, below the fold).

**Two safety rules are non-negotiable and shape every rule below:**

1. **Everything is wrapped in `@media (prefers-reduced-motion: no-preference)`.**
   Not merely "disabled" under reduced motion — *absent*. This matters because
   the global reduced-motion block at `src/styles/globals.css:143-149` only
   kills `animation-duration` and `animation-iteration-count`; it does **not**
   kill `animation-delay`. A staggered `.enter--4 { animation-delay: 240ms; }`
   left active under reduced motion would hold the element at its `from` state
   (`opacity: 0`) for 240ms and then snap it in — a flash of missing content,
   which is worse than no animation. Gating at the `no-preference` level avoids
   this entirely.

2. **Scroll reveal is gated behind `@supports (animation-timeline: view())`.**
   Never ship an `opacity: 0` resting state that depends on JS to clear. If
   hydration fails, that hides the whole page permanently — an unacceptable
   failure mode for an accessibility product. With `@supports`, a browser that
   lacks scroll-driven animation just renders the content normally.

```css
/* target — add to the Motion token block, src/styles/globals.css:52-54 */
  /* Motion */
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);      /* entrances, exits, transforms */
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);  /* moving/morphing on screen */
  --dur-fast:  160ms;  /* press feedback, high-frequency UI */
  --dur-ui:    250ms;  /* UI state changes — stays under the 300ms UI budget */
  --dur-entry: 520ms;  /* marketing entrances — deliberately outside the UI budget */
  --rise:      24px;   /* entrance travel distance */
```

The three durations are a deliberate scale, not three arbitrary numbers: motion
gets slower as it gets rarer. `--dur-fast` is for things a user triggers dozens
of times a day and must never wait on; `--dur-ui` for occasional state changes;
`--dur-entry` for a first-visit marketing entrance, which is the one place the
audit playbook allows exceeding the 300ms UI budget.

`--dur-fast: 160ms` matches the button press feedback already hardcoded at
`src/styles/globals.css:258`, so the token codifies a value the repo already
chose rather than introducing a new one.

```css
/* target — new section, appended after the "Accessibility utilities" section
   (i.e. after the global reduced-motion block that ends at src/styles/globals.css:149) */

/* ---- Entrance & scroll-reveal primitives -------------------------- */
/*
   Motion here is strictly additive. Every rule lives inside
   @media (prefers-reduced-motion: no-preference), so reduced-motion users never
   get an opacity:0 resting state at all. Scroll reveal is additionally gated on
   @supports (animation-timeline: view()): browsers without scroll-driven
   animation render the content as-is, so no failure mode can ever hide content.
*/
@keyframes rise-in {
  from { opacity: 0; transform: translateY(var(--rise)) scale(0.96); }
  to   { opacity: 1; transform: none; }
}

@media (prefers-reduced-motion: no-preference) {
  /* On-load entrance — for above-the-fold elements only. */
  .enter { animation: rise-in var(--dur-entry) var(--ease-out) both; }
  .enter--1 { animation-delay:   0ms; }
  .enter--2 { animation-delay:  80ms; }
  .enter--3 { animation-delay: 160ms; }
  .enter--4 { animation-delay: 240ms; }
  .enter--5 { animation-delay: 320ms; }

  /* Scroll reveal — for below-the-fold elements.
     Timing function is linear on purpose: the animation is scrubbed by scroll
     position, so the scroll itself supplies the pacing. An ease here would
     fight the user's finger. */
  @supports (animation-timeline: view()) {
    .reveal {
      animation: rise-in linear both;
      animation-timeline: view();
      animation-range: entry 15% cover 30%;
    }

    /* Stagger, scroll-driven style. Scroll-timeline animations ignore
       animation-delay (there is no wall clock to delay against), so the stagger
       is expressed as progressively later end-points in the scroll range.
       ~6% of cover per step ≈ the 80ms feel of a time-based stagger. */
    .reveal-group > .reveal:nth-child(2) { animation-range: entry 15% cover 36%; }
    .reveal-group > .reveal:nth-child(3) { animation-range: entry 15% cover 42%; }
    .reveal-group > .reveal:nth-child(4) { animation-range: entry 15% cover 48%; }
  }
}
```

## Repo conventions to follow

- **Decorative/entrance motion is gated on `no-preference`, not disabled after
  the fact.** Exemplar — `src/styles/globals.css:400-406`, the hero panel drift:

  ```css
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

- **Progressive enhancement via `@supports` is already the house style.**
  Exemplar — `src/styles/globals.css:577-586` gates the FAQ reveal on
  `@supports (interpolate-size: allow-keywords)`. Follow that shape.
- Tokens live in the `:root` block at the top of `globals.css`. Add new ones
  to the existing `/* Motion */` group — do not start a parallel block.
- Shared primitives belong in `globals.css`; app-shell-only styles live in
  `app.css`. These are shared, so `globals.css` is correct.

## Steps

1. In `src/styles/globals.css:52-54`, extend the `/* Motion */` token group with
   the four new tokens (`--dur-fast`, `--dur-ui`, `--dur-entry`, `--rise`)
   exactly as written in the Target section. Leave the two existing `--ease-*`
   tokens untouched.

2. In `src/styles/globals.css`, immediately after the global reduced-motion
   block that ends at line 149 (`}` closing the `@media (prefers-reduced-motion:
   reduce)` rule) and before the `/* ---- Layout ---- */` section comment,
   insert the entire `/* ---- Entrance & scroll-reveal primitives ---- */`
   section from the Target above, verbatim including its comments.

3. Do not apply `.enter` or `.reveal` to any markup. This plan only defines the
   primitives; plans 017–022 apply them.

## Boundaries

- Do NOT modify the global reduced-motion block at `src/styles/globals.css:143-149`.
  It is a deliberate, settled default (see plan 002) — new motion opts out
  locally by being gated on `no-preference`.
- Do NOT refactor existing hardcoded durations (e.g. the `160ms` at
  `src/styles/globals.css:258`, the `250ms` at `:568`) onto the new tokens. That
  is a separate change and out of scope here.
- Do NOT touch `src/styles/app.css`.
- Do NOT change any `.tsx` markup.
- Do NOT add dependencies. This is CSS-only — no JS, no IntersectionObserver.
- If a step doesn't match the code you find (drift since commit 88d2ab8), STOP
  and report instead of improvising.

## Verification

- **Mechanical**: `pnpm build` succeeds. `grep -n "rise-in\|--dur-entry\|animation-timeline" src/styles/globals.css` shows the keyframe, the tokens, and the `view()` timeline.
- **Feel check**: nothing is applied yet, so there is nothing to see on screen.
  Confirm the primitives are inert and safe instead:
  - `pnpm dev`, open any page. It must look **exactly as it did before** this
    change — no element should animate, because no element carries `.enter` or
    `.reveal` yet.
  - In DevTools, add `class="enter enter--3"` to any element and reload: it
    rises 24px and fades in after a 160ms delay.
  - With that class still applied, open DevTools → Rendering → "Emulate CSS
    media feature prefers-reduced-motion: reduce" and reload. The element must
    appear **immediately at full opacity** — no delay, no flash of invisibility.
    This is the trap the `no-preference` gate exists to prevent; if the element
    blinks in after a beat, the gate is wrong.
- **Done when**: the build passes, no page's appearance changed, and the
  DevTools spot-check above behaves in both motion modes.
