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
      // !py-2 override matches MessageArtistButton's fullWidth
      // styling so the two stacked buttons read as the same height.
      // The `!` is required because Button's md sizeClass already
      // applies py-2.5, and Tailwind sorts py-2.5 AFTER py-2 in the
      // generated stylesheet, same specificity, later wins, so a
      // plain "py-2" override loses. Important wins.
      className={fullWidth ? "w-full justify-center !py-2" : undefined}
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
