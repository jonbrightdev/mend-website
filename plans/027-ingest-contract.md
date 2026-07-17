# Plan 027: Pin the ingest payload contract between website and extension

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **This plan touches TWO repositories**: this one and the extension at
> `../mend-a11y`. Confirm `../mend-a11y` exists and `git status` is clean in
> both before starting; if either is dirty or missing, STOP.
>
> **Drift check (run first)**:
> `git diff --stat cb1bec2..HEAD -- src/lib/ingest-payload.ts` here, and in
> `../mend-a11y`: `git log --oneline -3 -- src/lib/sync.ts`. If either side's
> payload shape changed since this plan was written, reconcile the "The
> contract today" section first.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW (tests and docs only — no runtime behaviour changes)
- **Depends on**: none (better after 024, since 429 joins the response table)
- **Category**: reliability / cross-repo
- **Planned at**: commit `cb1bec2`, 2026-07-17

## Why this matters

The ingest payload shape exists twice with no mechanical link:

- Extension: `buildIngestPayload` in `../mend-a11y/src/lib/sync.ts:50-76`
  (its `IngestIssue`/`IngestPayload` interfaces are hand-maintained mirrors).
- Website: `parsePayload` in `src/lib/ingest-payload.ts:87-147` (the actual
  validator, with caps and reject/truncate semantics).

Today the only thing keeping them aligned is the comment in
`src/routes/api/ingest.ts:10` pointing at the extension's types file. A field
rename on either side ships green through both CI pipelines and fails only
when a real user clicks Save. The plans README lists this drift risk as a
direction idea: share the contract as a versioned artifact.

## Design decisions (already made — do not re-litigate)

- **Shared fixtures, not a schema library.** The contract artifact is a
  directory of JSON payload fixtures plus a prose contract document. Each
  repo tests its own side against its own copy: the website asserts
  `parsePayload` accepts/rejects them as labelled; the extension asserts
  `buildIngestPayload` *produces* the canonical fixture byte-for-byte. No
  `ajv`, no new dependency in either repo (the website deliberately runs
  lean — see `mailer.ts`'s zero-dependency rationale).
- **Source of truth lives here** (`contract/` in mend-website), because the
  server's validator defines what is actually accepted. The extension carries
  a verbatim copy under `test/contract/`; a `CONTRACT_VERSION` line in both
  copies is the drift tripwire a human can diff in seconds.
- **No wire-format change.** `parsePayload` ignores unknown fields, so a
  future `schemaVersion` field would be backward-compatible — but adding one
  now changes what every deployed extension sends for zero immediate benefit.
  Rejected.

## The contract today (verify against code, then write it down)

Request: `POST /api/ingest`, `content-type: application/json`,
`authorization: Bearer <key>` (or a same-origin session cookie). Body ≤
1 000 000 UTF-16 units.

Payload (`sync.ts` produces → `parsePayload` validates):

| field | type | server behaviour |
|---|---|---|
| `url` | string, http(s), ≤ 2000 | reject otherwise |
| `pageTitle` | string ≤ 500 | optional; falls back to `url`; truncates |
| `startedAt` | epoch ms | reject if > now+24 h or < 2020-01-01 |
| `durationMs`, `totalChecks` | number | optional; out-of-range → dropped |
| `partial` | boolean | only `=== true` counts |
| `issues[]` | ≤ 1000 entries | reject if more |
| `issues[].ruleId` | string ≤ 200, non-empty | reject otherwise |
| `issues[].impact` | `critical\|serious\|moderate\|minor` | reject otherwise |
| `issues[].title` | string ≤ 500 | required; truncates |
| `issues[].selector` | string ≤ 2000 | required; truncates |
| `issues[].category`, `description`, `html`, `failureSummary` | strings | optional; truncate (2000/2000/5000/5000) |
| `issues[].helpUrl` | string ≤ 2000 | optional; over-long → dropped |
| `issues[].wcag` | string[] | entries > 200 chars dropped; max 25 kept |
| `issues[].domOrder` | number 0..1e6 | else falls back to array index |

Responses: `201 {auditId, violations}`, `200 {duplicate: true}` (idempotency
key: user + url + startedAt), `400 {error}`, `401 {error}`, `413 {error}` —
and `429 {error}` with `Retry-After` once plan 024 lands.

The general principle (from `ingest-payload.ts`'s comments): **identifiers
reject, display content truncates.**

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Website tests | `pnpm test` (in mend-website) | all pass |
| Website typecheck | `pnpm typecheck` | exit 0 |
| Extension tests | `npm run test:unit` (in ../mend-a11y) | all pass |
| Copy verification | `diff -r contract ../mend-a11y/test/contract` | no output |

## Scope

**In scope — mend-website** (this repo):
- `contract/README.md` (new — the prose contract, from the table above)
- `contract/fixtures/valid/*.json`, `contract/fixtures/invalid/*.json` (new)
- `src/lib/ingest-payload.contract.test.ts` (new)
- `plans/README.md` (status row)

**In scope — ../mend-a11y** (extension repo):
- `test/contract/` (verbatim copy of `contract/`)
- `test/contract.test.ts` (new)
- `package.json` (append the new test to the `test:unit` script — the runner
  is a plain `tsx` file list, see its `scripts`)

**Out of scope** (do NOT touch):
- `src/lib/ingest-payload.ts`, `src/routes/api/ingest.ts` — behaviour is
  documented, not changed. If writing the contract reveals a bug, report it;
  don't fix it here.
- `../mend-a11y/src/**` — production extension code stays untouched.
- npm packages, git submodules, workspace links between the repos.

## Git workflow

mend-website: work directly on `main` (per CLAUDE.md), e.g. "Pin the ingest
contract with shared fixtures". mend-a11y: check that repo's CONTRIBUTING.md
for its conventions; commit there separately — **do not push the extension
repo unless the operator confirms** (it has release automation hooks in its
version scripts).

## Steps

### Step 1: Write the contract document

`contract/README.md`: `CONTRACT_VERSION: 1` on its own line at the top,
then the endpoint description, the field table, the reject-vs-truncate
principle, the idempotency key, and the response table — derived from the
section above but **verified line-by-line against `parsePayload` as it
stands** (drift check may have moved caps).

### Step 2: Fixtures

`contract/fixtures/valid/`:
- `canonical.json` — exactly what `buildIngestPayload` emits for a small
  audit: 2 issues, all fields populated, including `durationMs`,
  `totalChecks`, `partial: false`. **Generate it from the extension's own
  code** (a one-off `tsx` script in the extension repo calling
  `buildIngestPayload` with a synthetic `AuditResult`), so it is by
  construction what the extension sends. Key order will match
  `buildIngestPayload`'s object literals; keep it.
- `minimal.json` — only required fields (`url`, `startedAt`, `issues: []`).
- `at-the-caps.json` — values exactly at limits (1000-char selector, 25 wcag
  entries, `domOrder: 1e6`).

`contract/fixtures/invalid/` — one file per rejection class, named for the
reason: `bad-url.json`, `future-startedAt.json`, `too-many-issues.json`
(generate programmatically in the test instead if a 1001-issue file is
ungainly — then document that exception in the fixture dir), `bad-impact.json`,
`empty-ruleId.json`.

### Step 3: Website contract test

`src/lib/ingest-payload.contract.test.ts` (pure — no database, no dynamic
imports): read every file in `contract/fixtures/valid/` → `parsePayload`
resolves without throwing; every file in `invalid/` → throws `IngestError`.
Also assert `contract/README.md` contains `CONTRACT_VERSION: 1` so a version
bump can't be forgotten in the doc.

**Verify**: `pnpm test` → passes; `pnpm typecheck` → exit 0.

### Step 4: Copy into the extension and test its side

1. `cp -r contract ../mend-a11y/test/contract`.
2. `../mend-a11y/test/contract.test.ts` (follow the style of that repo's
   existing `test/sync.test.ts`): build a synthetic `AuditResult` matching
   the one that generated `canonical.json`, run `buildIngestPayload`, and
   `deepStrictEqual` it against the parsed fixture. This is the drift
   tripwire: if either side changes shape, one repo's copy of the fixture
   disagrees with its code.
3. Append `&& tsx test/contract.test.ts` (matching the existing chain style)
   to `test:unit` in `../mend-a11y/package.json`.

**Verify**: `npm run test:unit` in `../mend-a11y` → all pass;
`diff -r contract ../mend-a11y/test/contract` → no output.

### Step 5: Cross-references

Update the pointer comment in `src/routes/api/ingest.ts:10`? **No** — that
file is out of scope. Instead the contract README (Step 1) ends with a
"Where this is enforced" section naming both test files and the update
protocol: *change `parsePayload` or `buildIngestPayload` → update
`contract/` here → re-copy to `../mend-a11y/test/contract` → bump
`CONTRACT_VERSION` if any accepted shape changed.*

## Test plan

Steps 3 and 4 are the test plan. The end state: a payload-shape change in
either repo fails that repo's own CI against its committed copy of the
contract, instead of failing in production.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm test` exits 0 here, including the contract test
- [ ] `npm run test:unit` exits 0 in `../mend-a11y`
- [ ] `diff -r contract ../mend-a11y/test/contract` → empty
- [ ] `grep "CONTRACT_VERSION: 1" contract/README.md` → 1 match
- [ ] ≥ 3 valid and ≥ 4 invalid fixtures exist
- [ ] `git status` clean of out-of-scope files in **both** repos
- [ ] Extension repo committed but NOT pushed (unless operator said push)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `../mend-a11y` is missing, dirty, or on a non-default branch.
- Writing the contract reveals the two sides *already* disagree (a field one
  sends that the other rejects/drops in a way users would notice) — that is
  a bug report, not a silent fixture that blesses the broken behaviour.
- The extension's `test:unit` chain has been replaced by a different runner —
  adapt to what's there only if trivial; otherwise report.
- You're tempted to extract a shared npm package or workspace link — rejected
  in the design decisions; the repos stay independent.

## Maintenance notes

- The copy is verbatim on purpose: `diff -r` is the entire sync tooling.
  Resist "improving" the extension's copy independently.
- When plan 024's 429 lands (if it hasn't), add it to the response table —
  responses are contract too; the extension shows `error` strings verbatim.
- If a third consumer of `/api/ingest` ever appears (CI action, CLI), it
  starts from `contract/README.md` and gets `canonical.json` as its first
  test asset — that's the payoff for keeping the fixtures honest.
