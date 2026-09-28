import "../globals.css";
import type { Metadata } from "next";
import { Inter as FontSans } from "next/font/google";
import { cn } from "@/lib/utils";
import { Providers } from "../providers";
import { NavigationMenu } from "@/components/navigation/NavigationMenu";
import { ThemeProvider } from "@/components/ThemeProvider";
import { CloudContextProvider } from "@/components/cloud/CloudContext";
import { loadCloudContext } from "@/lib/cloud-context";
import { ResourceRecoveryNotice } from "@/components/resources/ResourceRecoveryNotice";
import { Suspense } from "react";
import { CloudShellSkeleton } from "@/components/layout/CloudShellSkeleton";
import { readPrefs } from "@/lib/prefs";

const fontSans = FontSans({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: {
    template: "%s - Sunrise",
    default: "Sunrise",
  },
  description: "Modern OpenStack cloud operations",
};

async function AuthenticatedCloudShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const cloudContext = await loadCloudContext();

  return (
    <CloudContextProvider value={cloudContext.snapshot}>
      <NavigationMenu />
      <main>
        <Suspense>
          <ResourceRecoveryNotice />
        </Suspense>
        {children}
      </main>
    </CloudContextProvider>
  );
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const prefs = await readPrefs();
  const appearanceClass =
    prefs.appearance === "system" ? undefined : prefs.appearance;

  return (
    <html
      lang="en"
      className={cn("h-full", appearanceClass)}
      suppressHydrationWarning
    >
      <body
        className={cn(
          "min-h-screen bg-background font-sans antialiased h-full",
          fontSans.variable,
        )}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme={prefs.appearance ?? "system"}
          enableSystem
          disableTransitionOnChange
        >
          <Providers>
            <Suspense fallback={<CloudShellSkeleton />}>
              <AuthenticatedCloudShell>{children}</AuthenticatedCloudShell>
            </Suspense>
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
