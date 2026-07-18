# Plan 028: Let OAuth-only users delete their account

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0be29dc..HEAD -- src/lib/account-fns.ts src/components/AccountClient.tsx src/routes/account.tsx src/lib/account-fns.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `0be29dc`, 2026-07-18

## Why this matters

The account page promises users they can delete their account "at any time"
(the privacy copy in the danger zone says exactly that), but the delete-account
form **requires a password**: the submit button is disabled until one is typed,
and the client calls `authClient.deleteUser({ password })`. Users who signed up
via Google or GitHub (both are shipped, configurable sign-in providers) have no
credential account, so Better Auth rejects that call with
`CREDENTIAL_ACCOUNT_NOT_FOUND` — and they have no password to type in the first
place. For an accessibility/privacy-positioned product, an unfulfillable
deletion promise for a whole class of users is a real bug, not a nit.

Verified against the installed Better Auth (1.6.x) source
(`node_modules/better-auth/dist/api/routes/update-user.mjs`): when `password`
is present it requires a `providerId === "credential"` account row; when
`password` is absent and no `sendDeleteAccountVerification` is configured, it
deletes **iff the session is fresh** (created within `session.freshAge`,
default 24 h), otherwise throws `SESSION_EXPIRED`.

## Current state

Relevant files:

- `src/lib/account-fns.ts` — session-guarded server functions for the account
  page (`fetchAccount`, `createApiKey`, `revokeApiKey`, `deleteAllAudits`).
- `src/components/AccountClient.tsx` — client component; `DangerZone` at the
  bottom holds the delete-account form.
- `src/routes/account.tsx` — route; loader calls `fetchAccount`, renders
  `<AccountClient initialKeys={keys} />`.
- `src/lib/account-fns.test.ts` — existing tests; the pattern to follow.
- `src/db/schema.ts` — has the Better Auth `account` table
  (`providerId`, `userId` columns) already exported.

`src/lib/account-fns.ts:51-57` today:

```ts
export const fetchAccount = createServerFn({ method: "GET" }).handler(
  async () => {
    const user = await currentSessionUser();
    if (!user) throw redirect({ to: "/login" });
    return { user, keys: await listKeysFor(user.id) };
  },
);
```

`src/components/AccountClient.tsx` — the delete-account arm of `DangerZone`
(excerpt, lines ~195-213 and ~293-341):

```tsx
  async function onDeleteAccount() {
    setError(null);
    setPending(true);
    try {
      // Email+password accounts must re-verify with their password; on success
      // Better Auth clears the session and the DB cascades remove the data.
      const { error: authError } = await authClient.deleteUser({ password });
      ...
```

```tsx
          {armed === "account" ? (
            <form onSubmit={...}>
              <div className="field" style={{ maxWidth: "22rem" }}>
                <label htmlFor="delete-pw">Confirm your password</label>
                <input id="delete-pw" ... required />
              </div>
              ...
                <button
                  className="btn btn--danger"
                  type="submit"
                  disabled={pending || password.length === 0}
                >
```

Repo conventions that apply:

- Testable logic is exported as a plain function next to the server fn, because
  `createServerFn` wrappers can't be invoked from unit tests. Exemplar: the
  comment and shape of `assertKeyQuota` in `src/lib/account-fns.ts:41-49`
  ("Exported so the quota is testable without invoking the createServerFn
  wrapper"). Match it.
- DB tests use the in-memory harness: call `createTestDb()` from
  `src/test/db.ts` in `beforeAll` **before** dynamically importing any module
  that imports `@/db`. Exemplar: top of `src/lib/account-fns.test.ts`.
- Error strings shown to users are complete sentences ("Couldn't revoke that
  key. Please try again.").

## Commands you will need

| Purpose   | Command                        | Expected on success |
|-----------|--------------------------------|---------------------|
| Typecheck | `pnpm typecheck`               | exit 0              |
| One suite | `pnpm test src/lib/account-fns.test.ts` | all pass   |
| All tests | `pnpm test`                    | all pass (216 pre-existing + new) |
| Build     | `pnpm build`                   | exit 0              |

## Scope

**In scope** (the only files you should modify):
- `src/lib/account-fns.ts`
- `src/components/AccountClient.tsx`
- `src/routes/account.tsx`
- `src/lib/account-fns.test.ts`
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):
- `src/lib/auth.ts` — do **not** configure `sendDeleteAccountVerification`.
  Once configured, Better Auth routes *every* deletion (including
  password-verified ones) through an email round-trip, changing the tested
  email+password flow. That trade-off is deliberately not taken here.
- `src/lib/auth-client.ts`, `src/lib/session.ts`, `src/lib/session-fns.ts`.
- Better Auth configuration of `session.freshAge`.

## Git workflow

- Work directly on `main` (repo agreement — no feature branches, no PRs).
- Commit message style: single imperative sentence, e.g.
  `Let OAuth-only users delete their account`.
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Expose whether the user has a password credential

In `src/lib/account-fns.ts`:

1. Import the `account` table: extend the existing schema import to
   `import { account, apiKey, audit } from "@/db/schema";`.
2. Add an exported plain function (place it near `assertKeyQuota`, matching its
   test-seam comment style):

```ts
// Whether the user can re-verify with a password. OAuth-only accounts have no
// "credential" row, so the delete-account UI must not demand a password from
// them. Exported so it is testable without invoking the createServerFn wrapper.
export async function userHasPassword(userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
    .limit(1);
  return rows.length > 0;
}
```

3. In `fetchAccount`'s handler, return it:

```ts
return {
  user,
  keys: await listKeysFor(user.id),
  hasPassword: await userHasPassword(user.id),
};
```

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Thread `hasPassword` into the component

- `src/routes/account.tsx`: the loader data now includes `hasPassword`; pass it
  through: `<AccountClient initialKeys={keys} hasPassword={hasPassword} />`
  (destructure it from `Route.useLoaderData()` alongside `user` and `keys`).
- `src/components/AccountClient.tsx`: change the props to
  `{ initialKeys, hasPassword }: { initialKeys: ApiKeyRow[]; hasPassword: boolean }`
  and pass `hasPassword` down to `<DangerZone hasPassword={hasPassword} />`.

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: Branch the delete-account UI on `hasPassword`

In `DangerZone` (now `function DangerZone({ hasPassword }: { hasPassword: boolean })`):

- **`hasPassword === true`**: keep the existing armed form exactly as it is
  (password field, submit disabled while empty, `deleteUser({ password })`).
- **`hasPassword === false`**: when armed, render no password field — render a
  confirm row like the existing "Delete all synced audits" armed state (danger
  button "Permanently delete account" + ghost Cancel button), and call
  `authClient.deleteUser({})`.

In `onDeleteAccount`, build the argument conditionally:

```ts
const { error: authError } = hasPassword
  ? await authClient.deleteUser({ password })
  : await authClient.deleteUser({});
```

Handle the stale-session case for the no-password path. Better Auth returns an
error whose `code` is `"SESSION_EXPIRED"` when the session is older than the
freshness window (24 h by default). Map it to an actionable message:

```ts
if (authError) {
  setError(
    authError.code === "SESSION_EXPIRED"
      ? "For security, deleting your account needs a recent sign-in. Sign out, sign back in, then try again."
      : authError.message ?? "Couldn't delete your account.",
  );
  setPending(false);
  return;
}
```

(If the `error` object's TypeScript type doesn't expose `code`, check the shape
with a `console.log` in dev or read
`node_modules/better-auth/dist/api/routes/update-user.mjs`; fall back to
matching `authError.status === 400 && /session/i.test(authError.message ?? "")`
only if `code` is genuinely absent.)

Also update the explanatory copy in that section: the current paragraph is
written for password re-verification. For the no-password branch, the paragraph
should not mention a password.

**Verify**: `pnpm typecheck` → exit 0, and `pnpm build` → exit 0.

### Step 4: Tests

In `src/lib/account-fns.test.ts`, following the file's existing
`createTestDb`-then-dynamic-import pattern, add a describe block for
`userHasPassword`:

- Insert a user plus an `account` row with `providerId: "credential"` (include
  the not-null columns: `id`, `accountId`, `userId`, `providerId`) →
  `userHasPassword(userId)` resolves `true`.
- Insert a second user plus an `account` row with `providerId: "github"` →
  resolves `false`.
- A user with no account rows at all → resolves `false`.

**Verify**: `pnpm test src/lib/account-fns.test.ts` → all pass, including 3 new
tests.

## Test plan

Covered in Step 4 (server seam). The client branch is exercised by typecheck +
build only, because the repo has no component-test infrastructure at the time
of writing; plan 033 adds it, and its AccountClient suite must cover both
danger-zone branches. If plan 033 has already landed when you execute this
plan (check `vitest.config.ts` for a `.tsx` include pattern), extend the
AccountClient component tests to cover: OAuth branch renders no password field,
and SESSION_EXPIRED maps to the re-sign-in message.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0; the 3 new `userHasPassword` tests exist and pass
- [ ] `pnpm build` exits 0
- [ ] `grep -n "hasPassword" src/routes/account.tsx src/components/AccountClient.tsx` shows the prop threaded through both
- [ ] `grep -n "sendDeleteAccountVerification" src/lib/auth.ts` → 0 matches
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts.
- `authClient.deleteUser({})` fails typechecking because the client types
  require a password — that would mean the installed better-auth version
  differs from the one this plan was verified against; report the version.
- The `account` table in `src/db/schema.ts` lacks a `providerId` column.
- You find yourself wanting to modify `src/lib/auth.ts` — that is out of scope
  by decision, not oversight.

## Maintenance notes

- If `sendDeleteAccountVerification` is ever configured in `auth.ts`, the
  entire danger-zone flow changes semantics (every deletion becomes an email
  round-trip) — revisit both UI branches then.
- A user who set a password *and* linked OAuth has a credential row → gets the
  password branch. Correct today; if "unlink credential" is ever added,
  `fetchAccount`'s `hasPassword` must be re-derived after unlinking.
- Reviewer should scrutinize: the no-password branch must still be two-click
  (arm, then confirm) — no single-click deletion.
