# Plan 023: Send verification emails on signup through the existing mailer

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cb1bec2..HEAD -- src/lib/auth.ts src/lib/mailer.ts`
> If either file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (plan 013's mailer already landed)
- **Category**: auth / correctness
- **Planned at**: commit `cb1bec2`, 2026-07-17

## Why this matters

Email+password signup currently accepts any address and never checks it:
`user.emailVerified` stays `false` forever for those users. Password reset
therefore emails an address nobody proved they own, and any future
email-dependent feature (digests, notifications) starts from unverified data.
The single email seam (`src/lib/mailer.ts`, plan 013) makes this a
configuration change plus one template — the exact follow-up the plans README
lists under "Direction ideas".

OAuth signups (Google/GitHub) already arrive verified via the provider, and a
magic-link sign-in verifies by construction. This plan covers the remaining
path: email+password.

## Decision: verify, but do not require

Set `sendOnSignUp: true` so every new email+password user gets a verification
email, and `autoSignInAfterVerification: true` so clicking the link doesn't
dump them at a login form.

Do **not** set `emailAndPassword.requireEmailVerification: true`. That option
blocks sign-in for any unverified user — including everyone who signed up
before this plan — and turns a soft-launch feature into a lockout. Flipping it
later is a one-line change once existing users have had a chance to verify;
note it in "Maintenance notes", don't do it now.

## Current state

- `src/lib/auth.ts:19-76` — the `betterAuth({...})` call has
  `emailAndPassword` (with `sendResetPassword` wired to `sendMail`), a
  `user.deleteUser` block, conditional `socialProviders`, and a conditional
  `magicLink` plugin. There is **no** `emailVerification` block.
- `src/lib/mailer.ts` — `sendMail({ to, subject, text })`: posts to Resend
  when `RESEND_API_KEY`/`EMAIL_FROM` are set, otherwise logs to the console
  (`[mail:dev] ...`). No change needed here.
- `src/db/schema.ts:18-26` — `user.emailVerified` boolean already exists
  (Better Auth core schema), and the `verification` table (`:59-66`) stores
  the tokens. **No schema change, no migration.**
- Test harness: `src/test/db.ts` `createTestDb()` puts an in-memory PGlite on
  `globalThis.__mendDb`; modules importing `@/db` must be dynamically imported
  *after* it (see the comment block at the top of
  `src/routes/api/ingest.test.ts` for the pattern).

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Typecheck | `pnpm typecheck` | exit 0              |
| Tests     | `pnpm test`      | all pass            |
| Dev run   | `pnpm dev`       | serves on :3000     |

## Scope

**In scope** (the only files you should modify/create):
- `src/lib/auth.ts`
- `src/lib/auth-verification.test.ts` (new)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):
- `src/lib/mailer.ts` — the seam is already right.
- `src/db/schema.ts`, `drizzle/` — no schema change is needed.
- Signup/login UI (`src/routes/signup.tsx`, `src/components/*`) — no banner,
  no "resend" button in this plan; the flow works without UI.
- `.env.example` — no new variables are introduced.

## Git workflow

Work directly on `main` (per CLAUDE.md). Commit style: short imperative
sentence, e.g. "Send verification emails on signup". Run the full CI check
list before pushing.

## Steps

### Step 1: Add the `emailVerification` block

In `src/lib/auth.ts`, add a top-level `emailVerification` option to the
`betterAuth({...})` call, styled like the existing `sendResetPassword`:

```ts
emailVerification: {
  sendOnSignUp: true,
  autoSignInAfterVerification: true,
  // `url` is Better Auth's own /verify-email endpoint; it validates the
  // token, flips user.emailVerified, and redirects to the app.
  sendVerificationEmail: async ({ user, url }) => {
    await sendMail({
      to: user.email,
      subject: "Verify your Mend email",
      text: `Welcome to Mend!\n\nConfirm this email address so password reset and sign-in emails reach you:\n${url}\n\nIf you didn't create a Mend account, you can ignore this email.`,
    });
  },
},
```

Do not add `requireEmailVerification` anywhere (see "Decision" above).

**Verify**: `pnpm typecheck` → exit 0. If the option name or callback
signature doesn't typecheck, STOP (Better Auth API drift — see STOP
conditions).

### Step 2: Test that signup sends the email

New file `src/lib/auth-verification.test.ts`. Mock the mailer, boot the test
database, then dynamically import `@/lib/auth` (it pulls in `@/db`):

```ts
import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { user } from "@/db/schema";

vi.mock("@/lib/mailer", () => ({ sendMail: vi.fn().mockResolvedValue(undefined) }));
```

In `beforeAll`: `await createTestDb()`, then
`({ auth } = await import("@/lib/auth"))` and
`({ sendMail } = await import("@/lib/mailer"))`.

Cases:
1. `auth.api.signUpEmail({ body: { name: "Ada", email: "ada@example.com", password: "correct-horse-battery" } })`
   resolves; then `sendMail` was called with `to: "ada@example.com"`, a
   subject containing `"Verify"`, and a body text containing `http` (the
   link).
2. The created `user` row still has `emailVerified: false` (verification is
   sent, not assumed).

**Verify**: `pnpm test` → all pass, including the new file.

### Step 3: Exercise it once in dev

With no `RESEND_API_KEY` set, `pnpm dev`, sign up with a fresh email on
`/signup`, and confirm the server console prints a `[mail:dev]` block with
subject "Verify your Mend email" and a `/verify-email` URL. Open the URL and
confirm it redirects into the app signed in.

**Verify**: the visited link flips `emailVerified` — check the console or the
account page shows a signed-in session.

## Test plan

Step 2's new test file, plus the existing suite (`mailer.test.ts` already
pins the dev fallback; auth flows elsewhere must not regress).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `grep -n "sendVerificationEmail" src/lib/auth.ts` → 1 match
- [ ] `grep -n "requireEmailVerification" src/lib/auth.ts` → 0 matches
- [ ] `pnpm test` exits 0, including `auth-verification.test.ts`
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The installed `better-auth` version rejects the `emailVerification` option
  shape above (typecheck failure on the option name or callback signature).
  Do not guess an alternative API from memory — report the version and the
  type error.
- `signUpEmail` in the test refuses the call for a reason other than an
  assertion (e.g. requires extra configuration) — that suggests the auth
  config has drifted from the "Current state" excerpt.
- You find yourself wanting to edit signup UI or add a resend flow — that is
  scope creep; note it and stop at the config + tests.

## Maintenance notes

- Once most active users are verified, consider
  `emailAndPassword.requireEmailVerification: true`; with it, Better Auth
  re-sends the verification email on a blocked sign-in attempt. That flip
  deserves its own release note because it can lock out stale accounts.
- A "verify your email" banner + resend button on the account page is the
  natural UI follow-up; it needs `auth.api.sendVerificationEmail` and a
  client call — small, but a separate change.
