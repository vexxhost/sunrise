import "../globals.css";
import type { Metadata } from "next";
import { Inter as FontSans } from "next/font/google";
import { cn } from "@/lib/utils";
import { Providers } from "../providers";
import { NavigationMenu } from "@/components/navigation/NavigationMenu";
import { ThemeProvider } from "@/components/ThemeProvider";
import { CloudContextProvider } from "@/components/cloud/CloudContext";
import { loadCloudContext } from "@/lib/cloud-context";

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
              <main>{children}</main>
            </CloudContextProvider>
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
