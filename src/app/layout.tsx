import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { ServiceWorker } from "@/components/service-worker";

import "./globals.css";

export const metadata: Metadata = {
  title: "Ludo",
  description: "Play Classic and Nigerian Ludo with friends.",
  applicationName: "Ludo",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#07111f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
