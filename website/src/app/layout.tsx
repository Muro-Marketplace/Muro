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

const SITE_TITLE = "Wallplace – Curated Art for Commercial Spaces";
const SITE_DESCRIPTION =
  "Wallplace is a curated art marketplace connecting independent venues with emerging artists. Source artwork risk-free. Get discovered by commercial spaces.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s – Wallplace",
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
    // TODO(brand): drop a 1200x630 PNG at /public/og-image.png. Until
    // it lands, social cards will 404 the image and fall back to the
    // text-only embed.
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Wallplace",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/og-image.png"],
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
