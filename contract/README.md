CONTRACT_VERSION: 1

# Ingest payload contract

This is the wire contract between the extension's `buildIngestPayload`
(`mend-a11y/src/lib/sync.ts`) and the portal's `parsePayload`
(`mend-website/src/lib/ingest-payload.ts`). It exists as a versioned,
shared artifact because nothing else mechanically links the two: a field
rename on either side ships green through both repos' CI and only fails
when a real user clicks Save.

## Endpoint

`POST /api/ingest`

- `content-type: application/json`
- `authorization: Bearer <api key>` (or a same-origin session cookie —
  the extension always uses the bearer key, since its request is
  cross-origin and can't carry the site's cookie)
- Body must be ≤ 1,000,000 UTF-16 units.

## Payload

`buildIngestPayload` produces this shape; `parsePayload` validates it.

| field | type | server behaviour |
|---|---|---|
| `url` | string, http(s), ≤ 2000 chars | reject otherwise |
| `pageTitle` | string ≤ 500 chars | optional; falls back to `url`; truncates |
| `startedAt` | epoch ms (number) | reject if > now + 24h or < 2020-01-01 |
| `durationMs` | number | optional; out-of-range (negative, non-finite, or > 1e9) → dropped |
| `totalChecks` | number | optional; out-of-range (negative, non-finite, or > 1e9) → dropped |
| `partial` | boolean | only `=== true` counts as true |
| `issues[]` | array, ≤ 1000 entries | reject if more |
| `issues[].ruleId` | string ≤ 200 chars, non-empty | reject otherwise |
| `issues[].impact` | `critical \| serious \| moderate \| minor` | reject otherwise |
| `issues[].title` | string ≤ 500 chars | required; truncates |
| `issues[].selector` | string ≤ 2000 chars | required; truncates |
| `issues[].category` | string ≤ 200 chars | optional; truncates |
| `issues[].description` | string ≤ 2000 chars | optional; truncates |
| `issues[].html` | string ≤ 5000 chars | optional; truncates |
| `issues[].failureSummary` | string ≤ 5000 chars | optional; truncates |
| `issues[].helpUrl` | string ≤ 2000 chars | optional; over-long → dropped (not truncated, to avoid storing a broken link) |
| `issues[].wcag` | string[] | non-string entries dropped; entries > 200 chars dropped; only the first 25 kept |
| `issues[].domOrder` | number, 0..1,000,000 | out-of-range or missing → falls back to the issue's array index |

**The general principle**: identifiers reject (a truncated `ruleId` or
`url` would silently point at the wrong thing), display content truncates
(a real page can hold a legitimately huge element, and losing the tail of
a snippet beats dropping the whole audit).

## Idempotency

Duplicate detection keys on `(userId, url, startedAt)` — the server's
`scannedAt` column is `startedAt` interpreted as a `Date`. A second POST
with the same three values for the same authenticated user is treated as
a resend of the same audit, not a new one.

## Responses

| status | body | when |
|---|---|---|
| `201` | `{ auditId, violations }` | new audit stored |
| `200` | `{ duplicate: true }` | same `(user, url, startedAt)` already stored |
| `400` | `{ error }` | body isn't JSON, or fails a `parsePayload` check above |
| `401` | `{ error }` | no valid API key or session |
| `413` | `{ error }` | body exceeds 1,000,000 UTF-16 units |
| `429` | `{ error }`, with a `Retry-After` header (seconds) | caller (by user id) exceeded 60 requests/minute |
| `500` | `{ error }` | unexpected server failure while storing — safe to retry; a successful earlier attempt makes the retry a `200 duplicate` |

The extension shows the `error` string from the body verbatim in its
panel, so wording changes here are user-visible on that side too.

## Where this is enforced

- **mend-website**: `src/lib/ingest-payload.contract.test.ts` asserts
  every fixture in `fixtures/valid/` parses without throwing and every
  fixture in `fixtures/invalid/` throws `IngestError`.
- **mend-a11y**: `test/contract.test.ts` builds the same synthetic audit
  that produced `fixtures/valid/canonical.json` and asserts
  `buildIngestPayload` still produces that exact fixture.

**Update protocol**: change `parsePayload` or `buildIngestPayload` →
update `contract/` here → re-copy to `../mend-a11y/test/contract`
(`diff -r` must come back empty) → bump `CONTRACT_VERSION` above if any
previously-accepted shape changed (a new required field, a tightened
cap, a renamed field — not a cap that only got looser).

## Fixtures

`fixtures/valid/`:
- `canonical.json` — generated from the extension's own
  `buildIngestPayload`, not hand-written, so it is by construction what
  the extension actually sends.
- `minimal.json` — only the required fields.
- `at-the-caps.json` — several fields sitting exactly at their limit.

`fixtures/invalid/` — one payload per rejection reason, named for the
reason. `too-many-issues.json` (1001 issues) is generated inline in the
website's test instead of committed, since a 1001-entry fixture file is
unwieldy — see the note at the top of that test file.
