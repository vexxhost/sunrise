import "../globals.css";
import type { Metadata } from "next";
import { Inter as FontSans } from "next/font/google";
import { cn } from "@/lib/utils";
import { Providers } from "../providers";
import { ThemeProvider } from "@/components/ThemeProvider";
import { readPrefs } from "@/lib/prefs";

const fontSans = FontSans({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: {
    template: "%s - Sunrise Console",
    default: "Console - Sunrise",
  },
};

export default async function ConsoleRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const prefs = await readPrefs();
  const appearance = prefs.appearance ?? "system";
  const appearanceClass = appearance === "system" ? undefined : appearance;

  return (
    <html
      lang="en"
      className={cn("h-full", appearanceClass)}
      suppressHydrationWarning
    >
      <body
        className={cn(
          "min-h-screen bg-background font-sans antialiased h-full overflow-hidden",
          fontSans.variable,
        )}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme={appearance}
          enableSystem
          disableTransitionOnChange
        >
          <Providers>{children}</Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
