"use client";

import { usePathname } from "next/navigation";
import PortalGuard from "@/components/PortalGuard";
import VenuePortalLayout from "@/components/VenuePortalLayout";
import { isFullBleedPortalPath } from "@/lib/portal-nav";

/**
 * The venue portal's chrome mounts HERE, once, not inside each of the 12
 * pages. See artist-portal/layout.tsx for why: App Router swaps the page
 * element on navigation, so chrome rendered under the page is destroyed and
 * rebuilt on every click.
 *
 * The venue chrome paid an extra toll for that. Besides the reset gate and a
 * duplicate /api/account/roles, its self-heal effect fired a
 * PATCH /api/venue-profile on every remount, so a venue writing nothing at all
 * still issued a write per click. Mounted once, it runs once a session.
 *
 * /venue-portal/walls/[id] is the full-bleed wall editor and keeps rendering
 * bare, which is what it did before the move.
 */
export default function VenuePortalRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <PortalGuard allowedType="venue">
      {isFullBleedPortalPath(pathname ?? "") ? children : (
        <VenuePortalLayout>{children}</VenuePortalLayout>
      )}
    </PortalGuard>
  );
}
