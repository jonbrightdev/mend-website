# Plan 035: Broadcast the generated API key to the extension via postMessage

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b6e5be3..HEAD -- src/components/AccountClient.tsx src/components/AccountClient.test.tsx`
> If either file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding.
>
> **Companion plan**: this is the website half of a two-repo feature. The
> extension half (a content script in `../mend-a11y` that receives this
> message and stores the key) is `../mend-a11y/plans/007-account-key-relay.md`,
> handed off separately to a fresh session in that repo. Either half can land
> first — the extension's listener is inert without this broadcast, and this
> broadcast is a no-op if the listener isn't installed yet (postMessage with no
> listener is silently dropped).

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (this repo only)
- **Category**: feature
- **Planned at**: commit `b6e5be3`, 2026-07-18

## Why this matters

Today, connecting the extension requires the user to click "Generate a key" on
`/account`, then manually copy the plaintext key and paste it into the
extension's Settings screen (`AccountClient.tsx`, the `freshKey` reveal UI).
That copy-paste step is the entire "connect" flow — see
`src/components/AccountClient.tsx:70-77` ("Generate a key, paste it into the
extension's Settings...").

The extension can eliminate that step by injecting a content script into this
page that listens for the key and stores it directly (see the companion
plan). This plan is the website's half: broadcast the freshly generated key
via `window.postMessage` immediately after it's created, targeted at our own
origin only. It changes nothing for a user without the extension installed —
postMessage with no listener is a no-op — so the existing manual copy/paste
UI stays exactly as-is as the fallback.

## Current state

Relevant files:

- `src/components/AccountClient.tsx` — the account page's key-management UI.
- `src/components/AccountClient.test.tsx` — its component tests (jsdom).

`src/components/AccountClient.tsx:28-41` today:

```ts
  async function onGenerate() {
    setError(null);
    setPending(true);
    try {
      const { key, keys: next } = await createApiKey({ data: "Chrome extension" });
      setKeys(next);
      setFreshKey(key);
      setCopied(false);
    } catch {
      setError("Couldn't create a key. Please try again.");
    } finally {
      setPending(false);
    }
  }
```

## Commands you will need

| Purpose   | Command                                            | Expected on success |
|-----------|-----------------------------------------------------|---------------------|
| Typecheck | `pnpm typecheck`                                    | exit 0              |
| One suite | `pnpm test src/components/AccountClient.test.tsx`   | all pass            |
| All tests | `pnpm test`                                         | all pass            |

## Scope

**In scope** (the only files you should modify):
- `src/components/AccountClient.tsx`
- `src/components/AccountClient.test.tsx`
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though it looks related):
- `src/lib/account-fns.ts`, `src/lib/api-key.ts` — key generation is unchanged;
  this plan only adds a broadcast of the value already returned.
- `../mend-a11y` — that's the companion plan, executed as its own session in
  its own repo. Do not attempt to edit it from here.
- `src/routes/api/ingest.ts` — unrelated; the key still authenticates ingest
  the same way regardless of how it reached the extension.

## Git workflow

- Work directly on `main` (repo agreement — no feature branches, no PRs).
- Commit message style: single imperative sentence, e.g.
  `Broadcast the generated API key to the extension via postMessage`.
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Broadcast the key after it's generated

In `src/components/AccountClient.tsx`, extend `onGenerate` to post the key to
the page's own origin right after `setFreshKey`:

```ts
  async function onGenerate() {
    setError(null);
    setPending(true);
    try {
      const { key, keys: next } = await createApiKey({ data: "Chrome extension" });
      setKeys(next);
      setFreshKey(key);
      setCopied(false);
      // Best-effort handoff to the extension: if its content script is
      // listening on this page (see ../mend-a11y/plans/007), it stores the
      // key directly and the user never needs the copy/paste below. Silently
      // a no-op if no listener is present — the manual field stays the
      // fallback either way. Target our own origin explicitly, never "*", so
      // the key can't be picked up by an unrelated listener.
      window.postMessage(
        { source: "mend-website", type: "MEND_API_KEY", apiKey: key },
        window.location.origin,
      );
    } catch {
      setError("Couldn't create a key. Please try again.");
    } finally {
      setPending(false);
    }
  }
```

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Test

In `src/components/AccountClient.test.tsx`, add a test alongside the existing
"reveals a freshly generated key once" test:

```ts
  it("broadcasts the generated key via postMessage to its own origin", async () => {
    const user = userEvent.setup();
    vi.mocked(createApiKey).mockResolvedValue({
      key: "mend_secret_abc",
      keys: [key()],
    });
    const posted = vi.fn();
    window.addEventListener("message", (e) => posted(e.data, e.origin));

    render(<AccountClient initialKeys={[]} hasPassword={true} />);
    await user.click(screen.getByRole("button", { name: /generate a key/i }));

    expect(posted).toHaveBeenCalledWith(
      { source: "mend-website", type: "MEND_API_KEY", apiKey: "mend_secret_abc" },
      window.location.origin,
    );
  });
```

jsdom's `window.postMessage` dispatches asynchronously (a `MessageEvent` task),
so if the assertion above is flaky, `await` a microtask/short `vi.waitFor(() =>
expect(posted).toHaveBeenCalled())` before asserting the call args — prefer
`vi.waitFor` over a raw `setTimeout`/sleep.

**Verify**: `pnpm test src/components/AccountClient.test.tsx` → all pass
including the new test, then `pnpm test` → full suite green.

## Test plan

Covered in Step 2. Existing coverage that must not regress: the "reveals a
freshly generated key once, then hides it on Done" test, and the revoke test.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0, including the new postMessage test
- [ ] `grep -n "postMessage" src/components/AccountClient.tsx` → 1 match, with
      a literal target origin (`window.location.origin`), never `"*"`
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpt.
- `onGenerate`'s shape has changed such that the key is no longer available as
  a plain string at the point `setFreshKey` is called.

## Maintenance notes

- The message shape (`{ source: "mend-website", type: "MEND_API_KEY", apiKey
  }`) is a cross-repo contract with `../mend-a11y/plans/007-account-key-relay.md`.
  If either field name changes here, the extension's listener silently stops
  matching (postMessage handlers filter on shape, not just origin) — update
  both sides together, the same way `contract/README.md` is kept in sync for
  the ingest wire format.
- Deliberately no `postMessage` on page load with the *last-used* key — only
  a freshly generated one is ever broadcast, since that's the only moment the
  plaintext exists in memory at all (it's never stored or re-fetchable).
