"use client";

/**
 * Public wall card on /venues/[slug].
 *
 * Renders a single wall the venue has marked `is_public_on_profile`.
 * Click opens a lightbox showing the wall at full resolution with
 * dimensions + a "Request a placement on this wall" CTA that
 * deep-links into /artist-portal/placements with the venue and wall
 * info pre-filled. Customers and venues see the same card without
 * the artist CTA.
 *
 * Why a client component: the wall grid sits inside an RSC venue
 * page, so we punch through with this small island so we can hold
 * lightbox state + read the current user's role from AuthContext.
 *
 * The full "drag artwork onto this wall and send the rendered
 * composite to the venue" flow is the next step, wires in the
 * existing WallVisualizer in a new artist-side mode. Tracked
 * separately; this card is the unblocker.
 */

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { safeHexBackground } from "@/lib/hex-color";

export interface VenueWallCardProps {
  wall: {
    id: string;
    name: string;
    width_cm: number;
    height_cm: number;
    kind: "preset" | "uploaded";
    wall_color_hex: string;
    source_image_url?: string;
  };
  venue: {
    slug: string;
    name: string;
  };
}

export default function VenueWallCard({ wall, venue }: VenueWallCardProps) {
  const { userType } = useAuth();
  const [open, setOpen] = useState(false);

  // Body-scroll lock + Esc-to-close while the lightbox is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Build a deep link into the artist's placement request flow with
  // the venue + wall info encoded so the form can prefill a sensible
  // opening message.
  const wallDims = `${wall.width_cm} × ${wall.height_cm} cm`;
  const prefillMessage = `Hi ${venue.name}, I'd love to place work on your "${wall.name}" wall (${wallDims}).`;
  const requestHref = `/artist-portal/placements?venue=${encodeURIComponent(venue.slug)}&wallName=${encodeURIComponent(wall.name)}&wallDims=${encodeURIComponent(wallDims)}&prefillMessage=${encodeURIComponent(prefillMessage)}`;

  return (
    <>
      {/* Card, button-styled so it's obviously interactive. Same
          visual layout as the previous static card. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`View ${wall.name} wall`}
        className="group text-left rounded-sm overflow-hidden border border-border bg-white hover:border-accent/50 hover:shadow-sm transition-all"
      >
        <div className="aspect-[5/3] bg-stone-100 relative">
          {wall.kind === "uploaded" && wall.source_image_url ? (
            <Image
              src={wall.source_image_url}
              alt={wall.name}
              fill
              className="object-cover group-hover:scale-[1.02] transition-transform duration-500"
              sizes="(max-width: 640px) 100vw, 50vw"
              quality={90}
            />
          ) : (
            <div
              className="absolute inset-0 grid place-items-center p-6"
              style={{ backgroundColor: "#F7F4EE" }}
            >
              <div
                className="rounded shadow-inner"
                style={{
                  backgroundColor: safeHexBackground(wall.wall_color_hex, "#E5E1DA"),
                  width: `${Math.min(100, (wall.width_cm / wall.height_cm) * 60)}%`,
                  aspectRatio: `${wall.width_cm} / ${wall.height_cm}`,
                  maxHeight: "100%",
                }}
              />
            </div>
          )}
          {/* Subtle "view" affordance on hover */}
          <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/90 backdrop-blur text-[10px] font-medium text-foreground shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
            View wall
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </span>
        </div>
        <div className="px-3 py-2.5 flex items-center justify-between">
          <p className="text-sm font-medium text-foreground truncate">
            {wall.name}
          </p>
          <p className="text-[11px] text-muted tabular-nums shrink-0 ml-3">
            {wallDims}
          </p>
        </div>
      </button>

      {/* Lightbox */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${wall.name}, wall details`}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm grid place-items-center p-4 sm:p-8"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-3xl bg-stone-50 rounded-sm shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
          >
            {/* Close */}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/95 backdrop-blur shadow-sm flex items-center justify-center text-stone-600 hover:text-foreground transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>

            {/* Wall image */}
            <div className="relative bg-stone-100 flex-1 min-h-0">
              {wall.kind === "uploaded" && wall.source_image_url ? (
                <div className="relative w-full h-full min-h-[40vh]">
                  <Image
                    src={wall.source_image_url}
                    alt={wall.name}
                    fill
                    className="object-contain"
                    sizes="(max-width: 768px) 100vw, 768px"
                    quality={92}
                  />
                </div>
              ) : (
                <div
                  className="grid place-items-center p-10 min-h-[40vh]"
                  style={{ backgroundColor: "#F7F4EE" }}
                >
                  <div
                    className="rounded shadow-inner"
                    style={{
                      backgroundColor: safeHexBackground(wall.wall_color_hex, "#E5E1DA"),
                      width: `${Math.min(80, (wall.width_cm / wall.height_cm) * 50)}%`,
                      aspectRatio: `${wall.width_cm} / ${wall.height_cm}`,
                      maxHeight: "70vh",
                    }}
                  />
                </div>
              )}
            </div>

            {/* Detail panel */}
            <div className="px-5 sm:px-6 py-4 sm:py-5 border-t border-border bg-white flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <h3 className="font-serif text-xl text-foreground">
                  {wall.name}
                </h3>
                <p className="text-sm text-muted tabular-nums">{wallDims}</p>
              </div>
              <p className="text-xs text-muted leading-relaxed">
                Open wall at {venue.name}. Use this in a placement
                request and the venue will see exactly which wall
                you&rsquo;re proposing for.
              </p>

              {userType === "artist" ? (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-1">
                  <Link
                    href={requestHref}
                    className="inline-flex items-center justify-center px-4 py-2.5 rounded-sm bg-accent text-white text-xs font-semibold tracking-wider uppercase hover:bg-accent-hover transition-colors"
                  >
                    Request placement on this wall
                  </Link>
                  <span className="text-[11px] text-muted/80 text-center sm:text-left">
                    Opens your placement form with this wall pre-filled.
                  </span>
                </div>
              ) : userType === "venue" ? (
                <p className="text-[11px] text-muted/80">
                  Venues view-only. Artists can request to place work on
                  this wall directly from here.
                </p>
              ) : (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-1">
                  <Link
                    href="/apply"
                    className="inline-flex items-center justify-center px-4 py-2.5 rounded-sm bg-accent text-white text-xs font-semibold tracking-wider uppercase hover:bg-accent-hover transition-colors"
                  >
                    Apply as an artist
                  </Link>
                  <span className="text-[11px] text-muted/80 text-center sm:text-left">
                    Once approved, you can request placements on
                    venues&rsquo; walls.
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
