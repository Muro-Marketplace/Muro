"use client";

import { usePathname } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import DemoBanner from "@/components/DemoBanner";

export default function PagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isPortal = pathname?.startsWith("/artist-portal") || pathname?.startsWith("/venue-portal") || pathname?.startsWith("/customer-portal") || pathname?.startsWith("/admin");

  return (
    <div className="min-h-screen flex flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[200] focus:px-4 focus:py-2 focus:bg-accent focus:text-white focus:rounded-sm focus:text-sm"
      >
        Skip to content
      </a>
      <Header />
      {/* Demo-account banner, only renders when the signed-in user
          matches NEXT_PUBLIC_DEMO_ARTIST_USER_ID / _VENUE_USER_ID.
          Self-hides when those env vars aren't set, so this is safe
          to leave mounted before Phase 2 demo accounts are wired. */}
      <DemoBanner />
      <main id="main-content" className="flex-1 pt-14 lg:pt-16">{children}</main>
      {!isPortal && <Footer />}
    </div>
  );
}
