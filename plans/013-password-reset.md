# Plan 013: Replace the dead "Forgot password?" link with a working reset flow

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat dbd4669..HEAD -- src/lib/auth.ts src/components/auth src/routes .env.example`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (depends on Better Auth API names — see STOP conditions)
- **Depends on**: none (tests optional without plan 009)
- **Category**: bug
- **Planned at**: commit `dbd4669`, 2026-07-16

## Why this matters

The login form ships a visible **"Forgot password?" link that goes nowhere**
(`href="#0"`). A user who loses their password is permanently locked out of
their account and all synced audit history — there is no recovery path and no
email-sending capability anywhere in the app. This plan adds a minimal mail
sender (Resend HTTP API in production, console fallback in dev — the same
pattern the magic-link TODO already uses), wires Better Auth's password-reset
hooks, and builds the two-step reset UI.

## Current state

- `src/components/auth/LoginForm.tsx:128-133` — the dead link:

  ```tsx
  <div className="field__row">
    <label htmlFor="password">Password</label>
    {/* Password reset is wired alongside the email provider (see notes). */}
    <a href="#0">Forgot password?</a>
  </div>
  ```

- `src/lib/auth.ts` — the whole Better Auth server config (42 lines).
  `better-auth` version is `^1.6.17` (package.json). Key excerpt:

  ```ts
  export const auth = betterAuth({
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: { enabled: true },
    // ...google socialProviders spread, gated on env...
    plugins: magicLinkEnabled
      ? [
          magicLink({
            sendMagicLink: async ({ email, url }) => {
              // TODO: wire a real email provider (Resend/Postmark/SMTP) before
              // enabling this in production. Dev fallback logs the link so it can
              // be exercised locally without an email service.
              console.log(`[magic-link] ${email}: ${url}`);
            },
          }),
        ]
      : [],
  });
  ```

- `src/lib/auth-client.ts` — `authClient = createAuthClient({ plugins: [magicLinkClient()] })`
  from `better-auth/react`. Client calls look like
  `authClient.signIn.email({ email, password })` returning `{ error }`.
- Route conventions: pages are file routes under `src/routes/` using
  `createFileRoute`, with `head: () => ({ meta: [...] })` and a component
  wrapped in `MarketingShell` — see `src/routes/login.tsx` (renders
  `<LoginForm />`) as the exemplar for an auth page. Auth form conventions
  (state, `pending`, `error` with `role="alert"`, `errorStyle` const,
  `className="field"` / `input` / `btn btn--primary btn--lg btn--block`):
  follow `src/components/auth/LoginForm.tsx` closely.
- `.env.example` — has a "Better Auth" section and an "Optional sign-in
  methods" section; no email-provider vars yet.
- The verification schema table (`src/db/schema.ts:58-65`) already exists —
  Better Auth stores reset tokens there; **no schema change is needed**.

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Install   | `pnpm install`   | exit 0              |
| Typecheck | `pnpm typecheck` | exit 0              |
| Dev       | `pnpm dev`       | serves http://localhost:3000 |
| Tests     | `pnpm test`      | all pass (only if plan 009 landed) |

## Scope

**In scope** (the only files you should modify/create):
- `src/lib/mailer.ts` (create)
- `src/lib/auth.ts`
- `src/components/auth/LoginForm.tsx`
- `src/components/auth/ForgotPasswordForm.tsx` (create)
- `src/components/auth/ResetPasswordForm.tsx` (create)
- `src/routes/forgot-password.tsx`, `src/routes/reset-password.tsx` (create)
- `src/routeTree.gen.ts` (regenerated automatically by the dev/build tooling — never hand-edit)
- `.env.example`
- `src/lib/mailer.test.ts` (create, only if plan 009 landed)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):
- `src/components/auth/SignupForm.tsx` — no reset link belongs there.
- Email verification and enabling magic link in production — follow-ups, not
  this plan (but the magic-link **sender** is switched to the mailer, below).
- Adding an email SDK dependency — use `fetch` against Resend's HTTP API.

## Git workflow

- Branch: `advisor/013-password-reset`
- Commit style: short imperative sentence, e.g. "Wire password reset with a minimal mailer".
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create `src/lib/mailer.ts`

A server-only module (match the header-comment style of `src/lib/session.ts`,
which marks itself SERVER-ONLY):

```ts
interface Mail {
  to: string;
  subject: string;
  text: string;
}

// Sends via Resend's HTTP API when RESEND_API_KEY is set; otherwise logs to
// the server console so auth flows are fully exercisable in local dev.
export async function sendMail(mail: Mail): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    console.log(`[mail:dev] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: mail.to, subject: mail.subject, text: mail.text }),
  });
  if (!res.ok) {
    throw new Error(`mail send failed: ${res.status} ${await res.text()}`);
  }
}
```

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Wire Better Auth's reset hook (and switch magic link to the mailer)

In `src/lib/auth.ts`:

1. Import `{ sendMail }` from `"@/lib/mailer"`.
2. Extend `emailAndPassword`:

   ```ts
   emailAndPassword: {
     enabled: true,
     sendResetPassword: async ({ user, url }) => {
       await sendMail({
         to: user.email,
         subject: "Reset your Mend password",
         text: `Someone requested a password reset for your Mend account.\n\nReset it here (link expires in 1 hour):\n${url}\n\nIf this wasn't you, you can ignore this email.`,
       });
     },
   },
   ```

   **API-name check**: in better-auth 1.6.x the option is
   `emailAndPassword.sendResetPassword` with signature
   `({ user, url, token }) => Promise<void>`. Confirm against the installed
   types (`node_modules/better-auth` .d.ts or editor hover). If the option
   name differs, see STOP conditions.
3. Replace the magic-link `console.log` body with a `sendMail` call (subject
   "Your Mend sign-in link"), keeping the existing gating and updating the TODO
   comment to note dev fallback now lives in the mailer.

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: The request form — `/forgot-password`

Create `src/components/auth/ForgotPasswordForm.tsx` modeled directly on
`LoginForm.tsx`'s structure (same state pattern, `errorStyle`, field markup,
and the `sentTo` confirmation screen with focused heading — reuse the
"Check your inbox" layout, adjusting copy to "We sent a password reset link
to"). Submit handler:

```ts
const { error } = await authClient.requestPasswordReset({
  email: value,
  redirectTo: "/reset-password",
});
```

**API-name check**: current better-auth clients expose
`authClient.requestPasswordReset`; older 1.x used `authClient.forgetPassword`
with the same arguments. Use whichever exists on the installed client types.
On success show the sent screen **regardless of whether the email exists** (the
server behaves that way to avoid account enumeration — do not add a "no such
account" message).

Create `src/routes/forgot-password.tsx` modeled on `src/routes/login.tsx`
(same `MarketingShell`/auth-card wrapper, `head` meta title
"Reset your password — Mend").

**Verify**: `pnpm typecheck` → exit 0.

### Step 4: The reset form — `/reset-password`

Create `src/components/auth/ResetPasswordForm.tsx`: reads the `token` query
param (TanStack Router: `Route.useSearch()` with a `validateSearch` on the
route that accepts `{ token?: string }`). If no token, render an error state
with a link to `/forgot-password`. Otherwise a single new-password field
(reuse SignupForm's password field markup incl. `minLength={8}`, show/hide
toggle, and hint). Submit:

```ts
const { error } = await authClient.resetPassword({
  newPassword: password,
  token,
});
```

On success, `window.location.href = "/login"` (matching the hard-navigation
convention in LoginForm/SignupForm). On error (expired/used token), show the
error with a link to request a new one.

Create `src/routes/reset-password.tsx` with the `validateSearch` and the same
shell/meta conventions.

**Verify**: `pnpm typecheck` → exit 0.

### Step 5: Fix the login link and document env vars

- In `LoginForm.tsx`, replace `<a href="#0">Forgot password?</a>` with
  `<Link to="/forgot-password">Forgot password?</Link>` (the `Link` import
  already exists) and delete the stale comment above it.
- In `.env.example`, add under the Better Auth section:

  ```
  # --- Email (password reset, magic links) ---
  # Without these, emails are logged to the server console (dev fallback).
  RESEND_API_KEY=
  # Verified sender, e.g. "Mend <noreply@yourdomain.dev>".
  EMAIL_FROM=
  ```

**Verify**: `grep -n '#0' src/components/auth/LoginForm.tsx` → no matches.

### Step 6: End-to-end check in dev

1. `pnpm dev`, sign up a throwaway user (or use an existing local one).
2. Log out (or open a private window) → `/login` → "Forgot password?" →
   submit the email.
3. The reset URL appears in the **server console** (`[mail:dev] ...`). Open
   it, set a new password.
4. Log in with the new password → lands on `/dashboard`.
5. Re-open the same reset link → the form shows the expired/used-token error.

**Verify**: all five observations hold. Stop the dev server afterwards.

## Test plan

Only if plan 009 has landed: `src/lib/mailer.test.ts` — with
`RESEND_API_KEY`/`EMAIL_FROM` unset, `sendMail` resolves without fetching
(assert via a `console.log` spy or by the absence of thrown errors); with both
set (use obviously fake values) and a stubbed global `fetch` returning
`{ ok: false, status: 401 }`, it throws. The auth flow itself is covered by
the step-6 manual check — Better Auth's internals don't need unit tests here.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `grep -rn '"#0"' src/components/auth/` → no matches
- [ ] `src/routes/forgot-password.tsx` and `src/routes/reset-password.tsx` exist and render (dev server serves both without console errors)
- [ ] `grep -n "sendResetPassword" src/lib/auth.ts` → 1 match
- [ ] `grep -n "console.log" src/lib/auth.ts` → no matches (magic link now uses the mailer)
- [ ] `.env.example` documents `RESEND_API_KEY` and `EMAIL_FROM`
- [ ] Step 6 manual flow completed and reported
- [ ] `pnpm test` exits 0 (if a test script exists)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The installed better-auth types have **neither** `sendResetPassword` on
  `emailAndPassword` **nor** an equivalent reset option — report the actual
  option surface you found.
- The client exposes **neither** `requestPasswordReset` **nor**
  `forgetPassword`, or `resetPassword` takes a different shape than
  `{ newPassword, token }`.
- The reset email/URL never appears in the dev console in step 6 after one
  debugging attempt.
- You are tempted to add the `resend` npm package or nodemailer — don't; the
  fetch call is deliberate (zero new deps).

## Maintenance notes

- `sendMail` is now the single email seam. Follow-ups that reuse it: enabling
  email verification (`emailVerification.sendVerificationEmail`), and turning
  on magic link in production (`VITE_AUTH_MAGIC_LINK=true` — its sender is
  already switched).
- If the app moves off Resend, only `src/lib/mailer.ts` changes.
- Reviewer: check the forgot-password form does not reveal whether an email
  exists (no enumeration), and that the reset page handles a missing/expired
  token without crashing.
- Deliberately deferred: rate limiting reset requests (Better Auth applies its
  own defaults; revisit with plan 011's deferred rate-limiting decision).
