"use client";

import PortalGuard from "@/components/PortalGuard";

export default function ArtistPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PortalGuard allowedType="artist">{children}</PortalGuard>;
}
