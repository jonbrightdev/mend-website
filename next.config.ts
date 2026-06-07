import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Preserve any inbound links to the previous static site by redirecting the
  // old .html paths to the new clean routes. Portal redirects (login, dashboard,
  // details) are added alongside those pages in later stages.
  async redirects() {
    return [
      { source: "/index.html", destination: "/", permanent: true },
      { source: "/privacy.html", destination: "/privacy", permanent: true },
      { source: "/support.html", destination: "/support", permanent: true },
      { source: "/login.html", destination: "/login", permanent: true },
      { source: "/signup.html", destination: "/signup", permanent: true },
      { source: "/dashboard.html", destination: "/dashboard", permanent: true },
    ];
  },
};

export default nextConfig;
