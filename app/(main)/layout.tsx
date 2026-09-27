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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cloudContext = await loadCloudContext();
  const appearanceClass =
    cloudContext.appearance === "system" ? undefined : cloudContext.appearance;

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
          defaultTheme={cloudContext.appearance}
          enableSystem
          disableTransitionOnChange
        >
          <Providers>
            <CloudContextProvider value={cloudContext.snapshot}>
              <NavigationMenu />
              <main>
                <Suspense>
                  <ResourceRecoveryNotice />
                </Suspense>
                {children}
              </main>
            </CloudContextProvider>
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
