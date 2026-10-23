import type { Metadata } from "next";
import { JetBrains_Mono, Manrope } from "next/font/google"; // taste-skill-ignore: mono for <code> only
import "./globals.css";
import { Reveal } from "@/components/reveal";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { THEME_SCRIPT } from "@/lib/theme";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({ // taste-skill-ignore: mono for <code> only
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "KubeiQ: AI Tools for Kubernetes", template: "%s | KubeiQ" },
  description:
    "Open source, self-hosted AI tools for Kubernetes. Find out why workloads fail and how to fix them.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${jetbrainsMono.variable} h-full antialiased`} // taste-skill-ignore: mono for <code> only
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        {/* The page sits on a white sheet inside the tinted frame, the same move as the app. */}
        <main className="sheet mx-2 flex flex-1 flex-col">{children}</main>
        <SiteFooter />
        <Reveal />
      </body>
    </html>
  );
}
