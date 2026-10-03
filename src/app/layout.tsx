import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Optimization of Semiconductor Supply Chain Networks | 23MNG336 Team AA06",
  description: "Operations Research course project: minimum-cost logistics assignment and cost vs delivery-time goal programming for a semiconductor supply chain.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
