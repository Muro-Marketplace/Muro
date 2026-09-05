"use client";

import { usePathname } from "next/navigation";
import PortalGuard from "@/components/PortalGuard";
import ArtistPortalLayout from "@/components/ArtistPortalLayout";
import { isFullBleedPortalPath } from "@/lib/portal-nav";

/**
 * The artist portal's chrome mounts HERE, once, not inside each of the 21
 * pages.
 *
 * App Router keeps this layout mounted across sibling navigations and swaps
 * only the page element, so anything rendered here survives a click. When the
 * pages owned the chrome instead, React unmounted it on every navigation: the
 * sidebar left the DOM, the profile check reset to "loading", the full-screen
 * loader took over the viewport, and it stayed there until a fresh
 * GET /api/artist-profile returned. Four identical copies of that request went
 * out per navigation to /artist-portal/portfolio, one of them blocking paint.
 *
 * tests/integration/portal-chrome-in-layout.test.ts keeps the pages out of it.
 */
export default function ArtistPortalRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <PortalGuard allowedType="artist">
      {isFullBleedPortalPath(pathname ?? "") ? children : (
        <ArtistPortalLayout>{children}</ArtistPortalLayout>
      )}
    </PortalGuard>
  );
}
