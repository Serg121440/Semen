import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CriticalStyles } from "@/components/critical-styles";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bybit Trading Core",
  description: "DRY_RUN trading dashboard and rescue planner"
};

export default function RootLayout({
  children
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <CriticalStyles />
        {children}
      </body>
    </html>
  );
}
