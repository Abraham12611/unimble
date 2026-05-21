import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Suspense } from "react";
import { ThemeProvider } from "@/lib/theme";
import { Providers } from "./providers";
import { clerkAppearance } from "./(auth)/clerkAppearance";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Unimble - AI-Powered DevRel Automation",
  description: "Deploy autonomous AI operators for DevRel, GTM, and content operations",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <ClerkProvider
            taskUrls={{ "reset-password": "/reset-password" }}
            afterSignOutUrl="/sign-in"
            appearance={clerkAppearance}
          >
            <Suspense fallback={null}>
              <Providers>{children}</Providers>
            </Suspense>
          </ClerkProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
