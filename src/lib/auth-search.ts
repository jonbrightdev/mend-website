// `?from=extension` — the cross-repo handoff flag the Mend extension's
// post-audit prompt puts on /signup (see ../mend-a11y/plans/008). It rides
// through /login and lands on /account, where the Connect panel is emphasized.
//
// Deliberately a fixed flag rather than a `next=`/`redirect=` URL: destinations
// are derived internally from it, so there is nothing here an attacker can aim.
// Anything that isn't the literal "extension" normalizes to undefined.
export type AuthSearch = { from?: "extension" };

export function validateAuthSearch(search: Record<string, unknown>): AuthSearch {
  return { from: search.from === "extension" ? "extension" : undefined };
}
