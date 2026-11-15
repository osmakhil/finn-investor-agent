import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import TabBar from "@/components/TabBar";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "FINN",
  description: "Your portfolio, filtered. Push digest + alerts, and research that checks management's promises against the numbers.",
  appleWebApp: { capable: true, title: "FINN", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#0b0d10", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <div className="mx-auto min-h-dvh max-w-[480px] pb-24">{children}</div>
        <TabBar />
      </body>
    </html>
  );
}
