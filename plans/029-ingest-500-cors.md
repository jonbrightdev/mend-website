# Plan 029: Return CORS-visible JSON errors when ingest fails unexpectedly

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0be29dc..HEAD -- src/routes/api/ingest.ts src/routes/api/ingest.test.ts contract/README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `0be29dc`, 2026-07-18

## Why this matters

Every deliberate response from `POST /api/ingest` carries the CORS headers the
extension needs (its request is cross-origin from a `chrome-extension://`
page). But an *unexpected* error — the database transaction failing, or any
non-`IngestError` thrown below the parse step — propagates out of the handler,
and the framework's generic 500 has **no** `Access-Control-Allow-Origin`
header. The extension's `fetch` then fails at the CORS layer: the user sees an
opaque network error instead of the error message its panel is built to
display (the ingest contract states "The extension shows the `error` string
from the body verbatim in its panel"). This makes real outages undebuggable
from the extension side. The fix is a catch-all that turns unexpected failures
into a CORS-carrying `500 { error }` JSON response, logged server-side.

## Current state

Relevant files:

- `src/routes/api/ingest.ts` — the ingest route; `json()` helper attaches
  `CORS_HEADERS` to every deliberate response; the transaction at lines
  128-153 has no try/catch.
- `src/routes/api/ingest.test.ts` — write-path tests using the in-memory DB
  harness; the pattern to extend.
- `contract/README.md` — the versioned ingest wire contract; has a "Responses"
  table listing 201/200/400/401/413/429.

`src/routes/api/ingest.ts:115-159` today (abridged):

```ts
        let payload: IngestPayload;
        try {
          payload = parsePayload(body);
        } catch (e) {
          if (e instanceof IngestError) {
            return json({ error: e.message }, 400);
          }
          throw e;
        }

        // Both writes go in one transaction: ...
        const auditId = crypto.randomUUID();
        const result = await db.transaction(async (tx) => {
          ...
        });

        if (result.duplicate) {
          return json({ duplicate: true }, 200);
        }

        return json({ auditId, violations: result.count }, 201);
```

The `json(data, status)` helper (lines 42-44) already merges `CORS_HEADERS`;
reuse it.

Repo conventions that apply:

- Route tests import the route module dynamically in `beforeAll`, *after*
  `createTestDb()` has placed the in-memory PGlite on `globalThis` — see the
  comment block at the top of `src/routes/api/ingest.test.ts`.
- Error strings are complete sentences and user-facing (the extension shows
  them verbatim).

## Commands you will need

| Purpose   | Command                                  | Expected on success |
|-----------|------------------------------------------|---------------------|
| Typecheck | `pnpm typecheck`                         | exit 0              |
| One suite | `pnpm test src/routes/api/ingest.test.ts` | all pass           |
| All tests | `pnpm test`                              | all pass            |

## Scope

**In scope** (the only files you should modify):
- `src/routes/api/ingest.ts`
- `src/routes/api/ingest.test.ts`
- `contract/README.md` (add the 500 row)
- `../mend-a11y/test/contract/README.md` — **copy only** (see Step 3); skip if
  the sibling repo is absent.
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):
- `src/lib/ingest-payload.ts` — parsing is correct; the gap is below it.
- The `CONTRACT_VERSION` line in `contract/README.md` — a new failure status
  does not change any previously-accepted payload shape, so per the contract's
  own update protocol it does **not** bump.
- Rate limiting, auth resolution, body-size handling (plan 030 owns those
  lines; if you must touch them to resolve a merge, STOP).

## Git workflow

- Work directly on `main` (repo agreement — no feature branches, no PRs).
- Commit message style: single imperative sentence, e.g.
  `Return CORS-visible 500s from /api/ingest`.
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Catch unexpected storage failures

In `src/routes/api/ingest.ts`, wrap the transaction call:

```ts
        const auditId = crypto.randomUUID();
        let result: { duplicate: true } | { duplicate: false; count: number };
        try {
          result = await db.transaction(async (tx) => {
            ... // body unchanged
          });
        } catch (e) {
          // Without this, the framework's bare 500 has no CORS headers and the
          // extension surfaces an opaque network error instead of our message.
          console.error("ingest: failed to store audit", e);
          return json({ error: "Something went wrong saving this audit. Please try again." }, 500);
        }
```

Keep the transaction body byte-for-byte unchanged (including the
`onConflictDoNothing` duplicate path). Do not catch around `resolveUserId` or
the rate-limit check — only the storage step; a failure there is the case the
extension needs to see.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Test the 500 path

In `src/routes/api/ingest.test.ts`, add a test in the existing describe block.
The route's `db` is the same object the harness returned (both resolve through
`globalThis.__mendDb`), so a spy on it is seen by the route:

```ts
it("returns a CORS-visible JSON 500 when the transaction fails", async () => {
  const spy = vi
    .spyOn(db, "transaction")
    .mockRejectedValueOnce(new Error("boom"));
  const res = await post({ request: makeRequest(payload()) });
  spy.mockRestore();
  expect(res.status).toBe(500);
  expect(res.headers.get("access-control-allow-origin")).toBe("*");
  const body = await res.json();
  expect(body.error).toMatch(/went wrong/i);
});
```

Adapt `makeRequest`/`payload` names to whatever helpers the file actually
defines (it has a `payload()` builder; check how existing tests construct the
`Request` — reuse that helper). Import `vi` from `vitest` if not already
imported. Use a **distinct `startedAt`** from other tests so the mocked-away
insert can't collide with the idempotency index in later tests.

**Verify**: `pnpm test src/routes/api/ingest.test.ts` → all pass including the
new test.

### Step 3: Document the 500 in the contract

In `contract/README.md`, add one row to the Responses table (after the 429 row):

```
| `500` | `{ error }` | unexpected server failure while storing — safe to retry; a successful earlier attempt makes the retry a `200 duplicate` |
```

The contract's update protocol requires the copy in the extension repo to stay
identical. If `../mend-a11y/test/contract/` exists:

```
cp -R contract/ ../mend-a11y/test/contract/
diff -r contract ../mend-a11y/test/contract
```

→ `diff -r` prints nothing. Do **not** commit or push anything in
`../mend-a11y`; just leave the working-tree copy updated and mention it in
your report. If the sibling repo is absent, skip this and state so in your
report.

**Verify**: `diff -r contract ../mend-a11y/test/contract` → empty (or skipped
with a note).

## Test plan

- New test (Step 2): transaction rejection → 500, `access-control-allow-origin: *`,
  JSON body with `error` string. Model after the existing tests in
  `src/routes/api/ingest.test.ts`.
- Regression safety: the full existing suite must stay green — the try/catch
  must not swallow the duplicate path (`200 { duplicate: true }`) or change
  201 behavior.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0; the new 500-path test exists and passes
- [ ] `grep -n "failed to store audit" src/routes/api/ingest.ts` → 1 match
- [ ] `grep -n "500" contract/README.md` shows the new Responses row
- [ ] `grep -n "CONTRACT_VERSION" contract/README.md` still says `1`
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts.
- `vi.spyOn(db, "transaction")` fails because `transaction` is not a spyable
  method on the drizzle instance — report the drizzle version and the error
  rather than restructuring the route for testability.
- Plan 030 has already modified the same region of `ingest.ts` in a way that
  makes the excerpt unrecognizable.

## Maintenance notes

- Plan 030 edits the auth/rate-limit/body-read section *above* this try/catch;
  the two changes are line-adjacent but logically independent. Execute 029
  before 030 (or expect a trivial rebase).
- If a second storage path is ever added to the route, it belongs inside the
  same try/catch — the invariant is "no response leaves this handler without
  CORS headers".
- Reviewer: check the catch logs the underlying error (`console.error`) —
  returning a generic message without server-side logging would trade one
  debugging blackhole for another.
