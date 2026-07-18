`too-many-issues` (1001 issues, exceeding the 1000-issue cap) is not
committed as a file here — a 1001-entry JSON fixture is unwieldy to
review. It's generated inline instead, in
`src/lib/ingest-payload.contract.test.ts`, by cloning `canonical.json`'s
first issue 1001 times.
