import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Fraunces } from "next/font/google";
import "./globals.css";
import { AppProviders } from "./providers/AppProviders";
import { NavigationLoader } from "@/components/NavigationLoader";
import { SiteFooter } from "@/components/layout/SiteFooter";

const fontSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const fontDisplay = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700", "900"],
  style: ["normal"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Anndata — Every Meal Begins With a Farmer",
  description:
    "Direct produce markets, real-time mandi prices, and AI-driven crop intelligence for farmers, buyers, and FPOs.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#15150f",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fontSans.variable} ${fontDisplay.variable}`}>
      <body className="min-h-screen bg-background font-sans antialiased">
        <AppProviders>
          <div className="flex min-h-screen flex-col">
            <div className="flex-1">{children}</div>
            <SiteFooter />
          </div>
          <NavigationLoader />
        </AppProviders>
      </body>
    </html>
  );
}
