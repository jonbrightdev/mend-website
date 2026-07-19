# Plan 047: Route extension-driven signups to /account and finish the key handoff

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. Retire the plan per this repo's convention when
> done.
>
> **Drift check (run first)**: `git diff --stat a0f7690..HEAD -- src/routes/signup.tsx src/routes/login.tsx src/routes/account.tsx src/components/auth src/components/AccountClient.tsx`
> If any in-scope file changed since planning, compare the "Current state"
> excerpts against the live code before proceeding.
>
> **Companion plan**: `../mend-a11y/plans/008-account-signup-prompt.md` adds
> the extension's post-audit "create a free account" callout that opens
> `/signup?from=extension`. Either half can land first: until the extension
> ships, nobody arrives with the param and this is dead-but-harmless code;
> until this lands, extension users still reach a working signup page and
> just have to find /account themselves.

## Status

- **Priority**: P2 — bottom half of the dashboard-adoption funnel
- **Effort**: S-M
- **Risk**: LOW (routing + presentation; no schema, no API changes)
- **Depends on**: nothing in this repo. Website plan 035 (key postMessage)
  already shipped at `a0f7690`.
- **Category**: feature / growth
- **Planned at**: commit `a0f7690`, 2026-07-19

## Why this matters

The extension is adding a post-audit prompt for keyless users whose CTA opens
`/signup?from=extension`. The full funnel is:

1. Extension: audit finishes, no API key → callout → opens `/signup?from=extension`.
2. User signs up.
3. **Today they land on `/dashboard` — an empty dashboard, with no hint that
   the one remaining step is generating a key on /account.** This plan fixes
   that: with `from=extension`, land on `/account?from=extension` instead.
4. On /account they click "Generate a key". The existing postMessage
   broadcast (plan 035) + the extension's content-script relay
   (extension plan 007) put the key into extension storage automatically.
5. Back in the panel, the Save button is now live (the extension listens for
   the storage change) — they save their first audit.

Step 3 is the drop-off point this plan removes. An empty dashboard tells a
brand-new user "there's nothing here"; the account page with a highlighted
"Connect the Mend extension" panel tells them "one step left".

## Design decisions (made — do not relitigate, but STOP if they prove wrong)

- **No auto-generation of the key on arrival.** `from=extension` lives in the
  URL: a refresh, a bookmark, or a back-navigation would mint a fresh key
  each time, and keys are shown once and listed forever until revoked. Key
  creation stays behind an explicit click; this plan makes that click
  unmissable, not automatic.
- **The param is a fixed flag, not a redirect target.** Accept exactly
  `from=extension` and derive the destination internally. Never accept a
  `next=`/`redirect=` URL param here — that's an open-redirect footgun this
  flow doesn't need.
- **Login gets the same treatment.** The signup page links to /login
  ("Already have an account?"); an existing user arriving from the extension
  should also land on /account. Preserve the param across that link and honor
  it in `LoginForm`'s destinations.

## Current state

- `src/routes/signup.tsx:8-11` — already-authed users are redirected in
  `beforeLoad`/loader to `/dashboard`:

```ts
    if (await getSessionUser()) throw redirect({ to: "/dashboard" });
```

- `src/components/auth/SignupForm.tsx:46` — email signup success:
  `window.location.href = "/dashboard";`
- `src/components/auth/SignupForm.tsx:49-65` — OAuth (`callbackURL:
  "/dashboard"` for Google; genericOAuth GitHub likewise) and magic link
  (`callbackURL: "/dashboard"`).
- `src/components/auth/SignupForm.tsx:243-245` — footer link:
  `<Link to="/login">Log in</Link>`.
- `src/components/auth/LoginForm.tsx` — same `/dashboard` destinations
  (lines 44, 55, 61, 75).
- `src/routes/account.tsx:6-19` — route with `loader: () => fetchAccount()`,
  no `validateSearch`.
- `src/components/AccountClient.tsx:78-141` — the "Connect the Mend
  extension" panel: `section.panel` with `aria-labelledby="connect-h"`,
  privacy callout, and the "Generate a key" primary button (`onGenerate`
  broadcasts the postMessage on success).
- `src/routes/reset-password.tsx:9` — the repo's existing `validateSearch`
  pattern to copy.

## Commands you will need

| Purpose      | Command               | Expected on success |
|--------------|------------------------|---------------------|
| Typecheck    | `pnpm typecheck`      | exit 0              |
| Tests        | `pnpm test`           | all pass            |
| Lint         | `pnpm lint`           | exit 0              |

(Verify the runner — check how recent plans/commits invoked these; use `npm`
if that's what the repo actually uses.)

## Scope

**In scope**:
- `src/routes/signup.tsx`, `src/routes/login.tsx` — `validateSearch` for
  `from`, pass it to the forms, and make the already-authed redirect honor it
- `src/components/auth/SignupForm.tsx`, `LoginForm.tsx` — destination becomes
  `/account?from=extension` when the flag is set (email, OAuth `callbackURL`,
  magic link `callbackURL`); preserve the param on the signup↔login footer links
- `src/routes/account.tsx` — `validateSearch` for `from`, pass to `AccountClient`
- `src/components/AccountClient.tsx` — when arriving `from=extension`, focus
  and emphasize the Connect panel
- Tests alongside the components you touch
- This repo's plans/README retirement bookkeeping

**Out of scope**:
- API key creation/revocation logic and the postMessage broadcast (shipped, 035)
- Any schema change or signup-source analytics column (see Maintenance notes)
- `../mend-a11y` — companion plan, its own session in its own repo
- Email-verification flow changes (plan 023, still pending) — see STOP conditions

## Git workflow

Match this repo's existing conventions (check recent `git log`). Do NOT push
unless the operator instructed it.

## Steps

### Step 1: Validate and thread the param

In `signup.tsx` and `login.tsx`, following the `reset-password.tsx` pattern:

```ts
validateSearch: (search: Record<string, unknown>): { from?: "extension" } => ({
  from: search.from === "extension" ? "extension" : undefined,
}),
```

Make the already-signed-in redirect honor it too (an extension user who
already has an account but no key hits this path):

```ts
if (await getSessionUser())
  throw redirect(from === "extension" ? { to: "/account", search: { from } } : { to: "/dashboard" });
```

(Adapt to how `beforeLoad`/loader receives `search` in this router version —
check an existing route that reads search in a loader, or read it via the
route API the codebase already uses. Do not guess a new pattern.)

Pass `fromExtension: boolean` as a prop into `SignupForm`/`LoginForm`.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Post-auth destinations

In both forms, compute once:

```ts
const destination = fromExtension ? "/account?from=extension" : "/dashboard";
```

and use it for: the email-flow `window.location.href`, every
`callbackURL` (Google social, GitHub oauth2, magic link). Update the
signup↔login footer links to preserve the param
(`<Link to="/login" search={fromExtension ? { from: "extension" } : undefined}>` —
match the router's typed-search Link API as used elsewhere in the repo).

**Verify**: `pnpm typecheck` → exit 0; existing auth-form tests still pass
(`pnpm test`).

### Step 3: Account page emphasis

In `account.tsx`, add the same `validateSearch`, and pass
`fromExtension` into `AccountClient`.

In `AccountClient`, when `fromExtension` is true:

- Prepend a short callout inside the Connect panel (above the existing
  privacy callout): **"One step left."** "Generate a key and the Mend
  extension will pick it up automatically — then use Save on any audit."
- Move keyboard focus to the panel on mount
  (`ref` + `tabIndex={-1}` + `focus()` in an effect on the
  `section[aria-labelledby="connect-h"]`), so the flow reads correctly for
  screen-reader and keyboard users. Focus the section, not the button —
  announcing context beats dumping focus on a button.
- Do NOT auto-click generate (see Design decisions).

After a key is generated while `fromExtension` (i.e. in the existing
`freshKey` reveal), extend the reveal copy for this arrival path: "If the
extension is installed in this browser, it has already picked this key up —
check the panel for the Save button." The manual copy field stays regardless
(the user may be signing up in a different browser than the one with the
extension).

**Verify**: `pnpm typecheck` → exit 0.

### Step 4: Tests

Follow the existing patterns (`AccountClient.test.tsx` exists and mocks
`account-fns`):

1. `AccountClient` with `fromExtension` renders the "One step left" callout
   and moves focus to the Connect panel; without it, neither happens.
2. `SignupForm`/`LoginForm` with `fromExtension` use
   `/account?from=extension` for the email flow destination and pass it as
   `callbackURL` to the social/magic-link calls (spy on `authClient`, as the
   existing tests presumably do — mirror their mocking approach).
3. Search validation: `from=extension` accepted; `from=evil` and
   `from=https://…` normalize to `undefined`.

**Verify**: `pnpm test` → all pass; `pnpm lint` → exit 0.

## Test plan

Automated: Step 4. Manual end-to-end (requires the extension with its plan
008 built, but the website half can be smoke-checked alone):

1. Visit `/signup?from=extension`, create an account with email/password →
   land on `/account?from=extension`, focus on the Connect panel, callout
   visible.
2. Click "Generate a key" → key reveal shows, including the
   extension-pickup sentence.
3. Visit `/signup?from=extension` while already signed in → redirected to
   `/account?from=extension`, not `/dashboard`.
4. Visit `/signup` (no param) → everything behaves exactly as before
   (lands on `/dashboard`).
5. From `/signup?from=extension`, click "Log in" → `/login?from=extension`;
   log in → `/account?from=extension`.
6. If OAuth providers are configured in the environment: one social signup
   with the param → callback lands on `/account?from=extension`.

## Done criteria

ALL must hold:

- [ ] `pnpm typecheck`, `pnpm test`, `pnpm lint` all exit 0
- [ ] `grep -rn "from=extension\|from: \"extension\"" src/routes src/components | wc -l` → covers signup, login, account, both forms
- [ ] No occurrence of a user-supplied URL being used as a redirect target
      (`grep -n "search.next\|search.redirect" src` → empty)
- [ ] `/signup` and `/login` without the param are byte-for-byte behaviorally
      unchanged (manual check 4)
- [ ] Manual checks 1–5 performed and passed (6 if providers configured)
- [ ] Plan retired per repo convention

## STOP conditions

- The "Current state" excerpts don't match the live code.
- Email verification (plan 023) has landed since planning and inserts a
  verify-email step between signup and session — if so, the destination
  logic may need to ride through the verification redirect instead of the
  form. Report how the landed 023 actually sequences it; do not guess.
- The router version's typed search API makes the `Link search={...}` /
  redirect-with-search pattern materially different from `reset-password.tsx`
  — mirror whatever the codebase does elsewhere; if there is no precedent for
  a redirect carrying search, report rather than inventing one.
- Anything requires touching the OAuth provider registration
  (`src/lib/auth.ts`) — `callbackURL` per-call should be enough; if a
  provider ignores it, report.

## Maintenance notes

- `?from=extension` is a cross-repo contract with
  `../mend-a11y/plans/008-account-signup-prompt.md` (the extension builds the
  URL). Renaming it breaks the handoff silently — there is no shared type.
- Attribution: this param is the natural hook for measuring the funnel
  ("how many signups came from the extension prompt?"). Recording it
  (e.g. a `signupSource` column or just structured request logging) is
  deliberately out of scope here — if wanted, plan it separately; the param
  will already be flowing.
- If a `next=` redirect param is ever added to auth pages later, keep the
  allowlist discipline this plan established: named flags mapped to internal
  paths, never raw URLs.
