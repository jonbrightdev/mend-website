# 007 — Fade the dashboard in over its skeleton

- **Status**: DONE
- **Commit**: b5deaa1
- **Severity**: LOW (missed opportunity — additive)
- **Category**: Missed opportunities
- **Estimated scope**: 2 files (`src/components/DashboardClient.tsx`, `src/styles/app.css`), ~8 lines

## Problem

While the dashboard loads, `DashboardPending` (`src/routes/dashboard.tsx:36-65`) shows a spinner and skeleton blocks. When the loader resolves, TanStack Router swaps in `DashboardClient`, whose real content **pops in** with no transition — a full-viewport jarring change from shimmer to data.

```tsx
/* src/components/DashboardClient.tsx:303-312 — current (the two render roots) */
  if (audits.length === 0) {
    return (
      <div className="wrap app-main">
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="wrap app-main">
```

## Target

A one-time ~200ms opacity fade on the loaded dashboard content, CSS-only via `@starting-style`, scoped with a dedicated modifier class so other `.app-main` pages (account, details) are untouched:

```css
/* src/styles/app.css — target, in the APP SHELL section */
.app-main--enter {
  transition: opacity 200ms var(--ease-out);
}
@starting-style {
  .app-main--enter { opacity: 0; }
}
```

```tsx
/* src/components/DashboardClient.tsx — target: both render roots */
<div className="wrap app-main app-main--enter">
```

Values: 200ms `--ease-out` (`cubic-bezier(0.23, 1, 0.32, 1)`; use the literal if plan 001 hasn't landed). **Opacity only, no transform** — the content replaces a skeleton that approximates its layout, and any vertical drift would fight that continuity. Reduced motion: the global kill in `globals.css:140-147` makes it instant — correct, and since this is pure opacity it was already reduced-motion-safe.

## Repo conventions to follow

- App-shell styles live under `/* ============ APP SHELL (dashboard + details) ============ */` in `src/styles/app.css:164+`; add the new rules right after the existing `.app-main` rule (app.css:167).
- Class naming follows the existing BEM-ish modifier style (`.panel__body--flush`, `.state--error`) — hence `app-main--enter`.
- Plan 006 establishes the identical `@starting-style` pattern for `.key-reveal` — imitate it.

## Steps

1. In `src/styles/app.css`, after the `.app-main` rule (line 167), add:

   ```css
   .app-main--enter {
     transition: opacity 200ms var(--ease-out);
   }
   @starting-style {
     .app-main--enter { opacity: 0; }
   }
   ```

2. In `src/components/DashboardClient.tsx`, change **both** root divs (the empty-state return at line 305 and the main return at line 312) from:

   ```tsx
   <div className="wrap app-main">
   ```

   to:

   ```tsx
   <div className="wrap app-main app-main--enter">
   ```

## Boundaries

- Do NOT add the class to `DashboardPending` in `src/routes/dashboard.tsx` — the skeleton must appear instantly.
- Do NOT add it to other `.app-main` pages (account, audit details) — dashboard only.
- Do NOT use a transform — opacity only.
- Do NOT touch loader logic or routing.
- If a step doesn't match the code you find (drift since commit b5deaa1), STOP and report instead of improvising.

## Verification

- **Mechanical**: `pnpm typecheck` passes; `pnpm build` succeeds.
- **Feel check**: `pnpm dev`, sign in, DevTools Network → throttle to "Slow 3G", navigate to `/dashboard`:
  - Skeleton and spinner appear instantly; when data arrives, the real dashboard **fades in over ~200ms** instead of popping.
  - The fade never delays interaction — during it, clicking a filter chip still works (opacity doesn't block hit-testing).
  - Remove throttling and re-navigate: with a fast load the fade is barely perceptible — that's correct; it must never read as latency.
  - Rendering panel → `prefers-reduced-motion: reduce`: content appears instantly.
- **Done when**: slow-loaded dashboards fade in smoothly, fast loads feel instant, and only the dashboard route gained the class.
