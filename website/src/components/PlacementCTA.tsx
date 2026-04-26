"use client";

import { useAuth } from "@/context/AuthContext";
import Button from "./Button";

/** Hides Request Placement buttons when the viewer is an artist. */
export function PlacementButton({
  artistSlug,
  artistName,
  variant = "secondary",
  size = "md",
  fullWidth = false,
}: {
  artistSlug: string;
  artistName: string;
  variant?: "primary" | "secondary";
  size?: "md" | "lg";
  /** Stretch to fill the parent column. */
  fullWidth?: boolean;
}) {
  const { userType } = useAuth();
  if (userType === "artist") return null;
  return (
    <Button
      href={`/venue-portal/placements?artist=${artistSlug}&artistName=${encodeURIComponent(artistName)}`}
      variant={variant}
      size={size}
      className={fullWidth ? "w-full justify-center" : undefined}
    >
      Request Placement
    </Button>
  );
}

/** Hides the entire CTA section when viewer is an artist */
export function PlacementCTASection({ children }: { children: React.ReactNode }) {
  const { userType } = useAuth();
  if (userType === "artist") return null;
  return <>{children}</>;
}
