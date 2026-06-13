import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "./auth/Providers";
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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
