import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "./auth/Providers";
import { AppNav } from "@/components/shell/AppNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Publisher",
  description:
    "A harness that turns a research concept into a persona-voiced single-page webpage.",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return (
    <html lang="en">
      <body>
        <Providers>
          <AppNav />
          {children}
        </Providers>
      </body>
    </html>
  );
}
