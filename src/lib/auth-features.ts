// Client-visible feature flags for the optional sign-in methods. These mirror
// the server configuration in auth.ts; set the public flag and the matching
// server credentials/provider together to enable a method.
export const authFeatures = {
  google: import.meta.env.VITE_AUTH_GOOGLE === "true",
  github: import.meta.env.VITE_AUTH_GITHUB === "true",
  magicLink: import.meta.env.VITE_AUTH_MAGIC_LINK === "true",
} as const;
