import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Community Pulse",
  description: "Community health dashboard for Reddit moderators",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
