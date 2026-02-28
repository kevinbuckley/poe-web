import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "POE Platform",
  description: "Panel of Experts web MVP",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
