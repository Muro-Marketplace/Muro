import type { Metadata } from "next";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import Providers from "@/components/Providers";
import CookieBanner from "@/components/CookieBanner";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  display: "swap",
});

const dmSerifDisplay = DM_Serif_Display({
  variable: "--font-dm-serif-display",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk").replace(/\/$/, "");

const SITE_TITLE = "Wallplace | Original art, seen on real walls";
const SITE_DESCRIPTION =
  "Wallplace is where original art meets real walls. Buy directly from independent artists, get your work seen in person, or find art for your space.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s | Wallplace",
  },
  description: SITE_DESCRIPTION,
  applicationName: "Wallplace",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Wallplace",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    locale: "en_GB",
    // No `images` here on purpose. An explicit entry overrides the
    // opengraph-image file convention, and the /og-image.png this used to
    // name was never added, so every page advertised an image that 404s.
    // app/opengraph-image.tsx and app/twitter-image.tsx generate the real
    // ones, for every route, and a route that wants its own can still
    // override this per page.
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport = {
  themeColor: "#1A1A1A",
  viewportFit: "cover" as const,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${dmSerifDisplay.variable}`}
    >
      <body className="antialiased">
        <Providers>
          {children}
          <CookieBanner />
        </Providers>
      </body>
    </html>
  );
}
