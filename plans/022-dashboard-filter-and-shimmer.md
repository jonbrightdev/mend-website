# 022 — Fade dashboard filter results in; fix the skeleton shimmer's easing

- **Status**: DONE
- **Commit**: 88d2ab8
- **Severity**: LOW
- **Category**: Missed opportunities (filter) + Easing & duration (shimmer)
- **Estimated scope**: 1 file (`src/styles/app.css`), ~8 lines changed
- **Depends on**: 016 (uses `--dur-fast`)

## Problem — two small defects on the same surface, in the same file

**1. Filter results teleport.** `DashboardClient` keeps four pieces of filter
state (`src/components/DashboardClient.tsx:202-205`):

```tsx
/* src/components/DashboardClient.tsx:202-205 — current */
  const [layout, setLayout] = useState<Layout>("overview");
  const [scope, setScope] = useState<string>("all");
  const [activeImpacts, setActiveImpacts] = useState<Set<Impact>>(new Set());
  const [search, setSearch] = useState("");
```

Toggling an impact chip or typing in search re-renders `.rule-list`
(`src/components/DashboardClient.tsx:561-565`), whose rows are keyed by
`r.ruleId`. Rows blink in and out under the cursor with nothing connecting the
before and after state. `.rule-row` has no transition today:

```css
/* src/styles/app.css:430-435 — current */
.rule-list { list-style: none; margin: 0; padding: 0; }
.rule-row {
  display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: .9rem;
  padding: .85rem 1.3rem; border-bottom: 1px solid var(--border);
}
.rule-row:last-child { border-bottom: 0; }
```

**2. The skeleton shimmer uses the wrong timing function.**

```css
/* src/styles/app.css:566 — current */
.sk { background: linear-gradient(90deg, var(--surface) 25%, #efe9da 37%, var(--surface) 63%); background-size: 400% 100%; border-radius: var(--r-sm); animation: sk 1.4s ease infinite; }
```

`ease` on an `infinite` loop is wrong (audit playbook §2: constant motion →
`linear`). Every 1.4s cycle accelerates, decelerates toward its end, then jumps
back to the start position — so the shimmer visibly pulses and hitches at each
loop boundary instead of sweeping steadily. `linear` is the only correct choice
for a looping sweep.

## Target

**The filter fade is deliberately minimal, and that is the whole point.** The
audit playbook is explicit (§1): interactions hit tens of times a day get motion
*removed or drastically reduced*, not added. Filtering a dashboard is exactly
that — a power user toggles impact chips constantly, and any movement, stagger
or scale there would turn a tool into a toy and make the dashboard feel slower
the more you use it. So: **opacity only, no transform, no stagger, at the
fastest token on the scale.** Just enough that rows don't pop, and nothing more.
This is the one surface where the "expressive" brief does not apply.

```css
/* target — replace src/styles/app.css:430-435 */
.rule-list { list-style: none; margin: 0; padding: 0; }
.rule-row {
  display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: .9rem;
  padding: .85rem 1.3rem; border-bottom: 1px solid var(--border);
  transition: opacity var(--dur-fast) var(--ease-out);
}
/* Rows are keyed by ruleId, so filtering mounts genuinely new rows. This fades
   those in rather than popping them under the cursor. Opacity only and 160ms on
   purpose: filtering is high-frequency UI, where motion must be reduced, not
   added — a rise or a stagger here would make the dashboard feel slower the more
   it is used. */
@starting-style {
  .rule-row { opacity: 0; }
}
.rule-row:last-child { border-bottom: 0; }
```

```css
/* target — src/styles/app.css:566, timing function only */
.sk { background: linear-gradient(90deg, var(--surface) 25%, #efe9da 37%, var(--surface) 63%); background-size: 400% 100%; border-radius: var(--r-sm); animation: sk 1.4s linear infinite; }
```

**Rows that leave will still disappear instantly.** CSS cannot animate an element
React has already unmounted, and giving exits real motion would mean an
exit-animation library or a View Transition — far too much machinery for a
filter. The asymmetry is fine here and arguably correct: the appearance of
results is the information, and a filter that lingers on its way out would feel
sluggish.

## Repo conventions to follow

- `@starting-style` for mount entrances is the house pattern. Exemplars —
  `src/styles/app.css:169-173` (`.app-main--enter`, plan 007) and
  `src/styles/globals.css:626-638` (`.key-reveal`, plan 006).
- App-shell styles live in `app.css`. Both rules are already there — edit in
  place, do not relocate.
- No `no-preference` gate is needed: these are a `transition` and an
  `animation-duration`, both already handled by the global reduced-motion block
  at `src/styles/globals.css:143-149`. `.sk` additionally has its own
  `animation: none` override at `src/styles/app.css:571`, which is correct and
  stays.

## Steps

1. In `src/styles/app.css:431-434`, add the transition to `.rule-row` and insert
   the `@starting-style` block plus its comment between `.rule-row` and
   `.rule-row:last-child`, exactly as in the Target section.

2. In `src/styles/app.css:566`, change `animation: sk 1.4s ease infinite;` to
   `animation: sk 1.4s linear infinite;`. Change nothing else on that line — the
   gradient, `background-size` and `border-radius` all stay.

## Boundaries

- Do NOT edit `src/components/DashboardClient.tsx`. No new state, no
  `useEffect`, no keys changed, no animation library. This is CSS-only.
- Do NOT add a `transform`, `translateY`, `scale` or stagger to `.rule-row`, and
  do NOT reach for `--rise`, `--dur-entry`, `.enter` or `.reveal` here. Those are
  marketing primitives; see the Target section for why they are wrong on
  high-frequency UI. If this feels too subtle, that is the intended result — do
  not "improve" it.
- Do NOT rewrite `.sk` to animate `transform` instead of `background-position`.
  `background-position` is not compositable, but this is a handful of skeleton
  blocks shown briefly, and a rewrite is a bigger change than the problem
  justifies. Timing function only.
- Do NOT touch `.sk`'s reduced-motion override at `src/styles/app.css:571`, or
  the spinner rules at `:575-584` (plan 002's work).
- Do NOT touch `.app-main--enter` at `src/styles/app.css:168-173`.
- Do NOT add an exit animation for filtered-out rows.
- Do NOT add dependencies.
- If a step doesn't match the code you find (drift since commit 88d2ab8), STOP
  and report instead of improvising.

## Verification

- **Mechanical**: `pnpm build` succeeds. `grep -n "sk 1.4s" src/styles/app.css`
  shows `linear`, not `ease`. `grep -A2 "@starting-style" src/styles/app.css`
  shows both the `.app-main--enter` block and the new `.rule-row` block.
- **Feel check**: `pnpm dev`, sign in and open `/dashboard` with at least one
  synced audit:
  - Toggle an impact chip: newly-matching rule rows fade in instead of popping.
    Rows already on screen must **not** re-animate or flicker — if they do, the
    list keys are being lost somewhere and that's a separate bug worth reporting.
  - Type in the search box: the fade must never make typing feel laggy. Type a
    query fast, then delete it fast. If you notice the animation at all while
    typing, it is too slow — confirm `--dur-fast`, not `--dur-ui`, is being used.
  - Filtered-out rows vanish instantly. Expected, per the Target section.
  - Throttle the network to Slow 3G and reload `/dashboard` to hold the pending
    state: the skeleton blocks now sweep **steadily**, at constant speed, with no
    pulse or hitch at the loop boundary. Watch one block through three or four
    full cycles — the old `ease` was most obvious as a stutter at the moment the
    sweep restarts.
  - Still on Slow 3G, confirm the spinner keeps spinning (plan 002 behaviour is
    intact).
  - DevTools → Rendering → emulate `prefers-reduced-motion: reduce`: the
    skeleton does not shimmer at all, and filtering shows rows instantly.
- **Done when**: filtering fades rows in without ever feeling slow, the skeleton
  sweeps at constant speed with no hitch, and reduced motion is unaffected.
