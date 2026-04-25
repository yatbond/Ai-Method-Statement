import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "AI Method Statement Studio",
    template: "%s | AI Method Statement Studio",
  },
  description:
    "Construction-specific document production system for technically detailed, project-specific method statements.",
  robots: "noindex, nofollow", // Internal tool — not for public indexing
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
