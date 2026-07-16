# Plan 014: Let users delete their synced audits and their account

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat dbd4669..HEAD -- src/lib/account-fns.ts src/components/AccountClient.tsx src/routes/account.tsx src/routes/privacy.tsx src/lib/auth.ts src/db/schema.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. (Plan 011 adds a key-quota check to
> `account-fns.ts` and plan 013 edits `auth.ts` — those specific changes are
> expected and fine.)

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (account deletion touches Better Auth config)
- **Depends on**: none (plans 011/013 touch neighboring code — rebase, don't block)
- **Category**: security (privacy)
- **Planned at**: commit `dbd4669`, 2026-07-16

## Why this matters

Mend's whole pitch is privacy ("Private by default"), and synced audits contain
**real page content** — HTML snippets of failing elements. Yet once a user
saves audits to the dashboard there is **no way to delete anything**: no
per-site deletion, no delete-all, no account deletion. The privacy policy says
revoking a key "stops all further requests" but is silent about the data
already stored, which lives forever. This plan adds a danger zone to the
account page (delete all synced audits / delete account) and updates the
privacy policy to state the now-true retention story.

## Current state

- `src/db/schema.ts` — all user data cascades from `user`: `session`,
  `account`, `audit`, `apiKey` each have
  `.references(() => user.id, { onDelete: "cascade" })`, and `violation`
  cascades from `audit` (`onDelete: "cascade"`). So `DELETE FROM audit WHERE
  userId = ?` removes violations too, and deleting the `user` row removes
  everything. **Exception**: the `verification` table has no userId FK (it's
  keyed by `identifier`) — it holds only expiring tokens, ignore it.
- `src/lib/account-fns.ts` — the exemplar for session-guarded server
  functions. `revokeApiKey` (lines 66-83) is the pattern to copy for mutations:

  ```ts
  export const revokeApiKey = createServerFn({ method: "POST" })
    .validator((id: unknown): string => { ... })
    .handler(async ({ data: id }) => {
      const user = await currentSessionUser();
      if (!user) throw redirect({ to: "/login" });
      // Scope to the owner so a key id can't be revoked by another account.
      await db.update(apiKey)... .where(and(eq(apiKey.id, id), eq(apiKey.userId, user.id)));
      return { keys: await listKeysFor(user.id) };
    });
  ```

- `src/components/AccountClient.tsx` — the account page's single panel
  ("Connect the Mend extension"): React client component, `useState` for
  `pending`/`error`, calls server fns like `await revokeApiKey({ data: id })`,
  buttons `className="btn btn--ghost"` / `"btn btn--primary"`. Error display:
  `<p role="alert" style={{ color: "var(--sev-critical)", fontWeight: 600 }}>`.
- `src/routes/account.tsx` — renders `<AccountClient initialKeys={keys} />`
  inside `MarketingShell` with an `app-head` block.
- `src/lib/auth.ts` — Better Auth config; no `user.deleteUser` option
  configured. better-auth `^1.6.17` supports account deletion via
  `user: { deleteUser: { enabled: true } }` in the server config and
  `authClient.deleteUser(...)` on the client (email-password users pass
  `{ password }` for re-verification). Confirm exact names against installed
  types.
- `src/components/auth/SignOutButton.tsx` — exemplar for a client-side auth
  action followed by a hard navigation (pattern:
  `await authClient.signOut(); window.location.href = "/"` — open the file to
  confirm before copying).
- `src/routes/privacy.tsx:72-79` — the paragraph to amend:

  ```tsx
  ... You can disconnect at any time by turning sync
  off in the extension and revoking the key from your account page,
  which stops all further requests.
  ```

- CSS: styles live in `src/styles/app.css` (component classes like `.panel`,
  `.callout`, `.key-list`). A danger-zone panel can reuse `.panel` +
  `.callout`; only add new CSS if a visual distinction is truly needed, and
  match existing custom-property usage (`var(--sev-critical)` etc.).

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Install   | `pnpm install`   | exit 0              |
| Typecheck | `pnpm typecheck` | exit 0              |
| Dev       | `pnpm dev`       | serves http://localhost:3000 |
| Tests     | `pnpm test`      | all pass (only if plan 009 landed) |

## Scope

**In scope** (the only files you should modify/create):
- `src/lib/account-fns.ts` (add `deleteAllAudits` server fn)
- `src/lib/auth.ts` (enable `deleteUser`)
- `src/components/AccountClient.tsx` (danger zone UI)
- `src/routes/privacy.tsx` (retention/deletion copy)
- `src/styles/app.css` (only if a small danger-zone style is needed)
- `src/lib/account-fns.test.ts` or extension of existing test files (if plan 009 landed)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):
- Per-audit / per-URL deletion from the dashboard — deliberately deferred
  (see maintenance notes); do not add delete buttons to `DashboardClient.tsx`.
- The extension repo and the ingest endpoint.
- Exporting data (GDPR portability) — separate future concern.

## Git workflow

- Branch: `advisor/014-data-deletion`
- Commit style: short imperative sentence, e.g. "Add audit and account deletion to the account page".
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: `deleteAllAudits` server function

In `src/lib/account-fns.ts`, following the `revokeApiKey` pattern exactly
(session guard, owner scoping):

```ts
export const deleteAllAudits = createServerFn({ method: "POST" }).handler(
  async () => {
    const user = await currentSessionUser();
    if (!user) throw redirect({ to: "/login" });
    // violation rows cascade via the auditId FK.
    await db.delete(audit).where(eq(audit.userId, user.id));
    return { ok: true };
  },
);
```

Import `audit` from `@/db/schema` (the file currently imports only `apiKey`).

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Enable account deletion in Better Auth

In `src/lib/auth.ts`, add to the `betterAuth({ ... })` config:

```ts
user: {
  deleteUser: { enabled: true },
},
```

Check the installed types for the exact shape (`user.deleteUser.enabled` is
the better-auth 1.x location). Database cascades handle the app tables
(`audit`→`violation`, `apiKey`, `session`, `account`), and Better Auth deletes
its own rows — no schema change needed.

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: Danger zone UI on the account page

In `src/components/AccountClient.tsx`, add a second `<section className="panel">`
below the existing one, `aria-labelledby="danger-h"`, heading "Delete your
data". Two actions, each with an inline two-step confirm (a state variable per
action: first click arms it and swaps the label to "Click again to confirm";
an "Cancel" ghost button disarms; no `window.confirm`):

1. **Delete all synced audits** — calls `deleteAllAudits({ data: undefined })`
   (or no arg if the fn takes none), then shows a success note
   (`role="status"`) "All synced audits deleted." Button styling: ghost button
   with critical color (reuse `var(--sev-critical)` via inline style or a tiny
   `.btn--danger` class in `app.css` if inline gets unwieldy).
2. **Delete account** — for email-password users better-auth requires the
   current password: render a password input (reuse the `field` + `input`
   markup from the keys panel) once armed, then call
   `await authClient.deleteUser({ password })`; on success
   `window.location.href = "/"` (hard navigation, matching SignOutButton's
   pattern). Surface `error.message` through the existing `role="alert"`
   error paragraph.

Copy for the panel intro (privacy-forward, matches the site's tone):
"Synced audits can include snippets of real page content. You can remove them
— or your whole account — at any time. Deletion is immediate and permanent."

**Verify**: `pnpm typecheck` → exit 0.
**Verify (manual, dev server)**: with a local user that has ≥1 synced audit
(use `node scripts/create-api-key.mjs <email>` + a curl POST to
`http://localhost:3000/api/ingest`, or reuse existing local data): delete-all
empties the dashboard; account deletion signs you out, lands on `/`, and
`/login` with the old credentials fails.

### Step 4: Privacy policy update

In `src/routes/privacy.tsx`, amend the "Optional account sync" section's final
paragraph to add the retention story. Replace the sentence ending "which stops
all further requests." with:

> "...which stops all further requests. Audits you've already saved stay in
> your dashboard until you delete them: your account page lets you delete all
> synced audits, or your entire account, at any time. Deletion is immediate
> and permanent."

Also fix the now-overbroad meta description (`privacy.tsx:12-15`): change
"Short version: nothing leaves your device." to "Short version: nothing leaves
your device unless you turn on sync — and you can delete synced data anytime."
Leave the `lede` ("The short version: nothing leaves your device.") as-is only
if you also leave the callout unchanged — the callout already qualifies it;
prefer changing the lede to "The short version: nothing leaves your device
unless you say so." Keep the effective-date mechanism untouched.

**Verify**: `pnpm typecheck` → exit 0; page renders at `/privacy` in dev.

### Step 5: Tests (only if plan 009 landed)

Using the plan-009 PGlite harness: seed a user with 2 audits + violations and
a second user with 1 audit; run the deletion the server fn performs
(`db.delete(audit).where(eq(audit.userId, user1.id))`) and assert user1's
audits **and violations** are gone (cascade) while user2's remain. If the
`createServerFn` wrapper isn't directly invokable in Vitest, test the query
with owner-scoping at the Drizzle level and note it in a comment.

**Verify**: `pnpm test` → all pass.

## Test plan

See step 5, plus the two manual dev-server checks in step 3. The cascade
assertion (violations deleted with audits) is the critical case — it proves no
orphaned page content survives deletion.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `grep -n "deleteAllAudits" src/lib/account-fns.ts src/components/AccountClient.tsx` → definition + one call site
- [ ] `grep -n "deleteUser" src/lib/auth.ts src/components/AccountClient.tsx` → config + one client call
- [ ] `grep -n "stops all further requests" src/routes/privacy.tsx` → the amended paragraph mentions deletion
- [ ] Manual checks from step 3 completed and reported
- [ ] `pnpm test` exits 0 (if a test script exists)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The installed better-auth types don't offer `user.deleteUser` (or an
  equivalent) — report what the config surface actually exposes; do NOT
  hand-roll account deletion with raw SQL against Better Auth's tables.
- `authClient.deleteUser` rejects with a verification requirement that a
  password alone doesn't satisfy (e.g. it demands email verification for this
  operation) — report the exact error; the fallback UX is a product decision.
- Any cascade in "Current state" turns out not to exist in the live schema
  (check `src/db/schema.ts` references before writing the delete).

## Maintenance notes

- **Deferred by design**: per-URL/per-run deletion from the dashboard. When
  built, it should reuse the owner-scoped `db.delete(audit)` pattern with an
  `and(eq(audit.id, ...), eq(audit.userId, ...))` guard, and live in
  `dashboard-fns.ts`.
- If email verification lands later (plan 013's mailer makes it cheap), check
  whether `deleteUser` verification requirements change.
- Reviewer: the two-step confirm must not be bypassable by double-click race
  (disable the button while `pending`), and the delete-all call must be
  owner-scoped — the `where(eq(audit.userId, user.id))` clause is the entire
  security boundary.
- A GDPR data-export ("download my audits as JSON") would pair naturally with
  this panel — noted, not planned.
