// Client-visible feature flags for the optional sign-in methods. These mirror
// the server configuration in auth.ts; set the public flag and the matching
// server credentials/provider together to enable a method.
export const authFeatures = {
  google: process.env.NEXT_PUBLIC_AUTH_GOOGLE === "true",
  magicLink: process.env.NEXT_PUBLIC_AUTH_MAGIC_LINK === "true",
} as const;
