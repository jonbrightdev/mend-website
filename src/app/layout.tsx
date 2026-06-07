import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Mend — find what's broken on your page, and how to fix it",
    template: "%s — Mend",
  },
  description:
    "Mend is a free, open-source Chrome extension that audits the page you're viewing against WCAG and shows you what's wrong, where it lives, and how to fix it — all on your machine.",
};

export const viewport: Viewport = {
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
