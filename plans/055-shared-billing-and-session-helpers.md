# Plan 055: Extract the duplicated Checkout call and session guard

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 9930443..HEAD -- src/components/BillingPanel.tsx src/routes/pricing.tsx src/lib/session.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `9930443`, 2026-07-21

## Why this matters

Two mechanical duplications, both already acknowledged in the code:

1. **The Stripe Checkout `fetch` exists twice**, in `BillingPanel.tsx` and
   `pricing.tsx`, differing by about two words of comment. Plan 041 explicitly
   left "a shared `billing-client` helper" as an owed follow-up. A change to
   the Checkout contract — error shape, credentials handling, double-submit
   guard — currently needs identical edits in two files, and the failure mode
   if you forget one is a payment flow that misbehaves on one entry point only.

2. **The session-guard preamble appears 13 times** across the `-fns.ts`
   modules. It is two lines and well understood, but it means every new server
   function has to remember to paste it, and changing the redirect target means
   touching 13 sites.

Neither is urgent. Both are cheap, mechanical, well-tested by existing suites,
and remove a class of "forgot one" bug. This is good executor work: the
verification story is clean and the blast radius is bounded.

## Current state

### Duplication 1 — the Checkout fetch

`src/components/BillingPanel.tsx:17-42`:

```ts
  // Both Checkout and the Customer Portal answer with { url } and expect the
  // session cookie, which fetch omits by default on a same-origin POST issued
  // from a hydrated island — hence credentials: "include".
  async function go(path: string, body?: Record<string, string>) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !data.url) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setPending(false);
        return;
      }
      // Leaving the app entirely, so `pending` stays true — the button must not
      // re-enable behind the navigation and allow a second Checkout session.
      window.location.href = data.url;
    } catch {
      setError("Something went wrong. Please try again.");
      setPending(false);
    }
  }
```

`src/routes/pricing.tsx:32-60` is the same function with the path inlined and a
fixed body:

```ts
  // Same contract as the account panel: POST returns { url }, and the session
  // cookie has to be sent explicitly on a fetch from a hydrated island.
  async function startCheckout() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          price: interval === "year" ? "pro_yearly" : "pro_monthly",
        }),
      });
      // ... identical from here
```

Note the two behaviours that must survive extraction:

- `credentials: "include"` is **required** — these are fetches from a hydrated
  island and the session cookie is not sent otherwise.
- On success, `pending` deliberately stays `true` because the page is
  navigating away. Re-enabling the button would allow a second Checkout
  session. Both files comment on this; keep the behaviour and keep a comment.

`BillingPanel.tsx`'s `go()` is used for **both** Checkout and the Customer
Portal (hence the `path` parameter). The extracted helper must serve both.

### Duplication 2 — the session guard

`src/lib/session.ts` currently exports only:

```ts
export interface SessionUser { ... }
export async function currentSessionUser(): Promise<SessionUser | null>
```

The guard pattern appears **13 times** across `src/lib/*.ts` — verify with:

```
grep -rn "throw redirect({ to: \"/login\" })" src/lib/*.ts | wc -l
```

Sites include `account-fns.ts` (4), `monitor-fns.ts` (5), `dashboard-fns.ts` (2),
`vpat-fns.ts` (1), `session-fns.ts` (1). The shape is:

```ts
const user = await currentSessionUser();
if (!user) throw redirect({ to: "/login" });
```

**`src/lib/pricing-fns.ts` is different and must not be changed.** It calls
`currentSessionUser()` and deliberately does **not** redirect — `/pricing` is a
public page that renders differently when signed out. Converting it would break
the page for logged-out visitors.

### Conventions this repo uses — match them

- **Pure/shared helpers live in `src/lib/`** with a `*.test.ts` twin where the
  logic is non-trivial. `src/lib/security-headers.ts` is a good small exemplar.
- **Client-side modules must not import `@/db`.** The repo has a server-only
  import protection that `pnpm build` enforces — a value (not type) imported
  from a server module into client code fails the build. The new billing client
  helper is imported by two **client components**, so it must import nothing
  server-side. Keep it a plain `fetch` wrapper.
- **Comments explain *why*.** Both duplicated blocks carry a "why" comment
  about `credentials` and about `pending`; carry those into the helper.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | exit 0 |
| Generate routes | `pnpm generate-routes` | exit 0 |
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Targeted tests | `pnpm vitest run src/components/` | all pass |
| Full suite | `pnpm test` | all pass (528 at plan time) |
| Build | `pnpm build` | exit 0 — **this is the check that catches a server-only import leak** |

Run `nvm use` first — `.nvmrc` pins Node 24.

## Scope

**In scope**:

- `src/lib/billing-client.ts` (create)
- `src/lib/billing-client.test.ts` (create)
- `src/components/BillingPanel.tsx`
- `src/routes/pricing.tsx`
- `src/lib/session.ts` (add one export)
- `src/lib/account-fns.ts`, `src/lib/monitor-fns.ts`, `src/lib/dashboard-fns.ts`,
  `src/lib/vpat-fns.ts`, `src/lib/session-fns.ts` (call-site swaps only)

**Out of scope** (do NOT touch, even though they look related):

- `src/lib/pricing-fns.ts` — its session read deliberately does not redirect.
  See "Current state". Changing it breaks `/pricing` when signed out.
- `src/routes/api/billing/checkout.ts` and `portal.ts` — the server side of
  this contract is unchanged. This plan only deduplicates the caller.
- `src/lib/billing-config.ts`, `src/lib/stripe.ts`, `src/lib/billing-queries.ts`
  — server-side billing, unrelated to the client fetch.
- Any change to the request or response shape of `/api/billing/*`.
- Any change to `pending`/`error` state ownership. Each component keeps its own
  state; the helper returns a result and does not manage React state.

## Git workflow

- Work directly on `main` — this repo does not use feature branches (see
  `CLAUDE.md`). Do not open a PR.
- Commit message style: imperative subject, blank line, prose body explaining
  *why*. Recent example: `Add security headers to every response`.
- Do **not** push. Leave the commit local for review.
- Commit the two halves separately — the billing helper and the session guard
  are independent, and a bisect is cheaper if they are not entangled.

## Steps

### Step 1: Create the billing client helper

Create `src/lib/billing-client.ts`. It must be a plain `fetch` wrapper with no
server imports and no React.

Target shape:

```ts
/**
 * Client-side caller for the billing endpoints. Both /api/billing/checkout and
 * /api/billing/portal answer with { url } on success and { error } otherwise.
 *
 * credentials: "include" is required, not decorative: these run from a
 * hydrated island, where fetch omits the session cookie by default on a
 * same-origin POST.
 *
 * Returns a result rather than navigating, so each caller keeps ownership of
 * its own pending/error state.
 */
export type BillingResult = { url: string } | { error: string };

export async function postBilling(
  path: string,
  body?: Record<string, string>,
): Promise<BillingResult> {
  try {
    const res = await fetch(path, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !data.url) {
      return { error: data.error ?? "Something went wrong. Please try again." };
    }
    return { url: data.url };
  } catch {
    return { error: "Something went wrong. Please try again." };
  }
}
```

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Test the helper

Create `src/lib/billing-client.test.ts`. Stub `globalThis.fetch` with
`vi.fn()`; no jsdom environment is needed since the helper touches no DOM.

Cases:

1. A 200 with `{ url }` returns `{ url }`.
2. A non-ok response with `{ error }` returns that error message.
3. A non-ok response with **no** body returns the generic fallback message.
4. A response whose body is not JSON returns the generic fallback (the
   `.catch(() => ({}))` path).
5. A rejected `fetch` (network failure) returns the generic fallback rather
   than throwing.
6. The request is sent with `credentials: "include"` and a JSON content-type —
   assert on the `fetch` mock's arguments. **This is the important one**: it is
   the property whose loss would silently break authentication.

**Verify**: `pnpm vitest run src/lib/billing-client.test.ts` → all pass, 6 tests.

### Step 3: Switch both callers to the helper

In `src/components/BillingPanel.tsx`, rewrite `go()` to call `postBilling` and
keep its own state handling:

```ts
  async function go(path: string, body?: Record<string, string>) {
    setPending(true);
    setError(null);
    const result = await postBilling(path, body);
    if ("error" in result) {
      setError(result.error);
      setPending(false);
      return;
    }
    // Leaving the app entirely, so `pending` stays true — the button must not
    // re-enable behind the navigation and allow a second Checkout session.
    window.location.href = result.url;
  }
```

Do the same for `startCheckout()` in `src/routes/pricing.tsx`, keeping its
`price` body.

**Verify**: `pnpm vitest run src/components/` → all pass. Then `pnpm build`
→ exit 0. The build is what proves no server-only import leaked into the
client bundle.

### Step 4: Add `requireSessionUser` to `session.ts`

Add to `src/lib/session.ts`:

```ts
/**
 * The signed-in user, or a redirect to /login. Server functions that require
 * a session should call this instead of repeating the guard — it was
 * duplicated at 13 sites before this existed.
 *
 * Note: /pricing deliberately does NOT use this. It renders for signed-out
 * visitors, so it calls currentSessionUser() and branches instead.
 */
export async function requireSessionUser(): Promise<SessionUser> {
  const user = await currentSessionUser();
  if (!user) throw redirect({ to: "/login" });
  return user;
}
```

Import `redirect` from the same package the `-fns.ts` files import it from —
check one of them and match exactly rather than guessing.

**Verify**: `pnpm typecheck` → exit 0.

### Step 5: Swap the 13 call sites

Replace each occurrence of the two-line pattern with
`const user = await requireSessionUser();` in:

`account-fns.ts`, `monitor-fns.ts`, `dashboard-fns.ts`, `vpat-fns.ts`,
`session-fns.ts`.

**Do not touch `pricing-fns.ts`.**

Run the full suite after each file.

**Verify**:
```
grep -rn "throw redirect({ to: \"/login\" })" src/lib/*.ts
```
→ exactly **1** result, in `src/lib/session.ts` (the new helper). Then
`pnpm test` → all pass.

### Step 6: Full gate

**Verify**, in order, all exit 0:

```
pnpm generate-routes
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Test plan

- **New tests**: 6 in `src/lib/billing-client.test.ts` (Step 2). Case 6
  (`credentials: "include"`) is the one that earns its keep.
- **No new tests for `requireSessionUser`.** It is a two-line extraction whose
  redirect behaviour is already exercised through the existing `-fns` suites;
  those passing unchanged is the verification.
- **Structural pattern**: `src/lib/security-headers.test.ts` for the plain-module
  style; `src/components/BillingPanel.test.tsx` (if present) for how components
  in this repo are tested — note the jsdom opt-in comment
  `// @vitest-environment jsdom` at the top of component test files.
- **Verification**: `pnpm test` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `src/lib/billing-client.ts` and its test exist; 6 tests pass
- [ ] `grep -rn "throw redirect({ to: \"/login\" })" src/lib/*.ts` returns exactly 1 result (in `session.ts`)
- [ ] `grep -c "credentials: \"include\"" src/components/BillingPanel.tsx src/routes/pricing.tsx` returns 0 for both (it now lives in the helper)
- [ ] `src/lib/pricing-fns.ts` is unmodified
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm build` all exit 0
- [ ] `pnpm test` exits 0 with no fewer passing tests than before, plus the 6 new
- [ ] `plans/README.md` status row for 055 updated

## STOP conditions

Stop and report back (do not improvise) if:

- `pnpm build` fails after Step 3. That almost certainly means a server-only
  module got pulled into the client bundle through the new helper — report the
  error rather than adding `type` keywords until it passes, because the wrong
  fix hides a real leak.
- The grep in Step 5 finds the pattern in `pricing-fns.ts` and you are tempted
  to convert it. Do not; re-read "Current state".
- Any `/pricing` or account test fails in a way that suggests the signed-out
  branch changed behaviour.
- The `-fns.ts` files import `redirect` from more than one source. That would
  mean the guard is not actually uniform, and the extraction needs rethinking.

## Maintenance notes

For whoever owns this next:

- **`postBilling` returns a result rather than navigating**, deliberately.
  Both callers navigate on success and both keep `pending` true while doing so.
  If a third caller appears that does *not* navigate away, that comment about
  `pending` belongs at the call site, not in the helper.
- **The `credentials: "include"` line is load-bearing.** It is the reason these
  requests authenticate at all. The test asserting it is not ceremony — if
  someone "tidies" it away, checkout breaks only for real users, never in a
  unit test that stubs fetch loosely.
- **`requireSessionUser` deliberately throws rather than returning null.** That
  matches how TanStack server functions propagate redirects. Do not soften it
  into a nullable return; the 13 call sites all want the throw.
- A reviewer should check two things: that `pricing-fns.ts` is untouched, and
  that no component's `pending`/`error` state semantics changed.
