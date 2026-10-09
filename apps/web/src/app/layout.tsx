import type { Metadata } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import { themeScript } from "@/lib/theme";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  axes: ["opsz", "wdth"],
});

export const metadata: Metadata = {
  title: {
    default: "Ripple: know when your email is read",
    template: "%s · Ripple",
  },
  description:
    "Ripple tracks opens and clicks on the emails you send from Gmail. See who opened, how many times, and when to follow up.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme script sets data-theme before hydration, so the attribute differs from the server's.
    <html lang="en" className={`${bricolage.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
