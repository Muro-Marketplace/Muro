"use client";

import PortalGuard from "@/components/PortalGuard";

export default function VenuePortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PortalGuard allowedType="venue">{children}</PortalGuard>;
}
