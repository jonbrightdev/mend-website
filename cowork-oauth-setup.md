# Task: finish enabling Google + GitHub sign-in for Mend

You are working in Chrome on Jon's behalf. The code for both OAuth providers is
already deployed; what's missing is the **configuration**: a GitHub OAuth app
does not exist yet, and the production environment on Railway has none of the
OAuth variables set. Your job is to create the GitHub OAuth apps, register the
production callback with Google, set the Railway variables, and verify the
login page works.

## Ground rules

- **Never paste client secrets into chat, a document, or anywhere other than**
  the local `.env` file and Railway's variable form. If you cannot write to
  `.env`, stop and ask Jon to paste the values himself — tell him which
  variable names to use.
- If any console UI differs from these instructions, adapt — the goal matters,
  not the exact click path.
- Ask Jon to log in if Chrome isn't already signed in to GitHub, Google Cloud,
  or Railway. Do not create new accounts.

## Facts you need

- App: **Mend**, an accessibility-audit dashboard. Repo: `jonbrightdev/mend-website`.
- Hosted on **Railway**; the project deploys from the repo's `main` branch.
- Auth is **better-auth**. Callback URL pattern: `<base-url>/api/auth/callback/<provider>`.
- Local base URL: `http://localhost:3000`.
- **Production base URL: unknown — find it first.** Open the Railway dashboard
  (railway.com), open the project for `mend-website`, and read the service's
  public domain (Settings → Networking, or the domain shown on the service
  card). Call this `PROD_URL` below (e.g. `https://mend-xyz.up.railway.app`).
  While there, check whether a `BETTER_AUTH_URL` variable is set on the
  service — note its value; it must equal `PROD_URL` (no trailing slash).
- Local env file (if you have file access): `/Users/jonpreece/source/mend-website/.env`.
  It already contains working Google credentials for dev
  (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `VITE_AUTH_GOOGLE=true`).

## Step 1 — Create two GitHub OAuth apps

GitHub OAuth apps accept only one callback URL each, so make one for dev and
one for production. Go to https://github.com/settings/developers → "OAuth
Apps" → "New OAuth App".

**App 1 — dev:**
- Application name: `Mend (dev)`
- Homepage URL: `http://localhost:3000`
- Authorization callback URL: `http://localhost:3000/api/auth/callback/github`

**App 2 — production:**
- Application name: `Mend`
- Homepage URL: `PROD_URL`
- Authorization callback URL: `PROD_URL/api/auth/callback/github`

For each app, after creating it click "Generate a new client secret". Copy the
client ID and secret at that moment — the secret is shown only once.

## Step 2 — Register the production callback with Google

Open https://console.cloud.google.com/apis/credentials and find the existing
OAuth 2.0 client for Mend (its client ID starts with `681809970947-`).

- Under **Authorized redirect URIs**, add: `PROD_URL/api/auth/callback/google`
  (keep the existing localhost entry).
- Under **Authorized JavaScript origins**, add `PROD_URL` if origins are listed.
- Save. If the console shows the OAuth consent screen is in "Testing" mode,
  note that in your report — only allow-listed test users can sign in until
  it's published; don't change it yourself.

## Step 3 — Update the local .env (dev GitHub app)

Append to `/Users/jonpreece/source/mend-website/.env`, using App 1's values:

```
GITHUB_CLIENT_ID=<dev app client id>
GITHUB_CLIENT_SECRET=<dev app client secret>
VITE_AUTH_GITHUB=true
```

If you don't have file access, skip this and tell Jon these three lines are
needed, with the values held back for him to fill from the GitHub app page.

## Step 4 — Set Railway variables (production apps)

In the Railway service → **Variables**, set:

```
GITHUB_CLIENT_ID=<production app client id>
GITHUB_CLIENT_SECRET=<production app client secret>
VITE_AUTH_GITHUB=true
GOOGLE_CLIENT_ID=<same value as in the local .env>
GOOGLE_CLIENT_SECRET=<same value as in the local .env>
VITE_AUTH_GOOGLE=true
```

Also confirm `BETTER_AUTH_URL` is set to `PROD_URL` exactly (https, no
trailing slash) — set it if missing.

Note: the `VITE_*` flags are baked in at **build time**, so a redeploy is
required. Saving variables normally triggers one; if Railway asks, apply/deploy
the changes and wait for the deployment to go green.

## Step 5 — Verify

1. Open `PROD_URL/login`. Both "Continue with Google" and "Continue with
   GitHub" buttons must be visible below the password form (also check
   `/signup`).
2. Click **Continue with GitHub** and complete the flow with Jon's GitHub
   account (ask him to approve the authorization prompt if one appears). You
   should land on `/dashboard` signed in.
3. Sign out, then click **Continue with Google** and confirm the same. If the
   consent screen is in Testing mode and Jon's Google account isn't a test
   user, record the exact error instead of forcing it.
4. If a button is missing: the redeploy likely didn't pick up the `VITE_*`
   flags — confirm the variables saved and a fresh deployment finished after
   they were set.

## Report back

When done, tell Jon: the production URL you found, which steps succeeded, the
result of both sign-in tests, whether the Google consent screen is
published or in Testing, and anything you had to skip (e.g. `.env` write
access). Do not include any client secrets in the report.
