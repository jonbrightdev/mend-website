"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      className="btn btn--ghost"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await authClient.signOut();
        window.location.href = "/";
      }}
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
