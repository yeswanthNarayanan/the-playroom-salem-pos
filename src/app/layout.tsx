import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import DatabaseMonitor from "@/components/pos/DatabaseMonitor";
import GlobalErrorNotification from "@/components/pos/GlobalErrorNotification";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#ffffff",
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "The playroom Salem",
  description: "The playroom Salem POS: Fast, offline-ready billing.",
  manifest: "/manifest.json",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased h-full overflow-auto md:overflow-hidden`}>
        {children}
        <footer className="w-full border-t border-slate-200 bg-white md:hidden">
          <div className="py-4 px-6 flex flex-col items-center justify-center text-xs text-slate-500">
            <p className="font-medium tracking-wide">
              &copy; {new Date().getFullYear()} The playroom Salem. All rights reserved.
            </p>
            <p className="mt-1 opacity-70">
              Transforming Retail Operations
            </p>
          </div>
        </footer>
        <DatabaseMonitor />
        <GlobalErrorNotification />
      </body>
    </html>
  );
}
