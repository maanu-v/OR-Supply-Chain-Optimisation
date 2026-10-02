import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flowline | Supply Chain Optimisation",
  description: "Capacitated outbound logistics decision support",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
