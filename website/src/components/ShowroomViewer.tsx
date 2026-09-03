"use client";
/**
 * The public showroom: an artist's saved wall pictures, one at a time, that
 * a visitor can move around in (drag, pinch, scroll) and take fullscreen.
 * Nothing here is saved; it is a view of pictures the artist already kept.
 */
import { useState } from "react";
import Link from "next/link";
import PanZoomImage from "@/components/PanZoomImage";
import { useFullscreenBox } from "@/lib/ui/fullscreen";
import { safeHexBackground } from "@/lib/hex-color";
import type { PublicShowroomWall } from "@/lib/artists/showroom";

interface Props {
  artistName: string;
  artistSlug: string;
  walls: PublicShowroomWall[];
  initialWallId?: string | null;
}

export function pictureFor(wall: PublicShowroomWall): string | null {
  return wall.preview_image_url ?? wall.source_image_url;
}

export default function ShowroomViewer({ artistName, artistSlug, walls, initialWallId }: Props) {
  const withPictures = walls.filter((w) => pictureFor(w));
  const [activeId, setActiveId] = useState<string>(
    () => withPictures.find((w) => w.id === initialWallId)?.id ?? withPictures[0]?.id ?? "",
  );
  const [fullscreenRef, fullscreen] = useFullscreenBox<HTMLDivElement>();
  const active = withPictures.find((w) => w.id === activeId) ?? null;
  const backHref = `/browse/${encodeURIComponent(artistSlug)}`;

  if (!active) {
    return (
      <div className="max-w-[900px] mx-auto px-6 py-16 text-center">
        <h1 className="font-serif text-2xl text-foreground mb-2">{artistName}&rsquo;s showroom is empty</h1>
        <p className="text-sm text-muted mb-6">They haven&rsquo;t shared a wall yet.</p>
        <Link href={backHref} className="text-sm text-accent hover:underline">Back to {artistName}</Link>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link href={backHref} className="text-xs text-muted hover:text-foreground">← Back to {artistName}</Link>
          <h1 className="font-serif text-2xl text-foreground truncate">{artistName}&rsquo;s showroom</h1>
          <p className="text-xs text-muted">
            {active.name} · {active.width_cm} × {active.height_cm} cm. Drag to move around, pinch or scroll to zoom.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fullscreen.toggle()}
          className="px-4 py-2 rounded-full bg-foreground text-background text-sm font-medium hover:bg-foreground/90"
        >
          {fullscreen.active ? "Exit fullscreen" : "Fullscreen"}
        </button>
      </div>
      <div ref={fullscreenRef} className={`wp-fullscreen-box rounded-xl overflow-hidden bg-stone-900 shadow-lg relative ${fullscreen.boxClassName}`}>
        {fullscreen.fake && (
          <button
            type="button"
            onClick={fullscreen.exit}
            className="absolute top-3 right-3 z-10 px-4 py-2 min-h-11 rounded-full bg-white/90 text-stone-900 text-sm font-medium shadow"
          >
            Exit fullscreen
          </button>
        )}
        <PanZoomImage key={active.id} src={pictureFor(active) as string} alt={`${active.name}, ${active.width_cm} by ${active.height_cm} cm`} heightClassName="h-[72vh]" />
      </div>
      {withPictures.length > 1 && (
        <div className="flex gap-3 overflow-x-auto pb-1" role="tablist" aria-label="Walls in this showroom">
          {withPictures.map((wall) => {
            const picture = pictureFor(wall) as string;
            const selected = wall.id === active.id;
            return (
              <button
                key={wall.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveId(wall.id)}
                className={`shrink-0 w-36 rounded-sm overflow-hidden border text-left ${selected ? "border-accent ring-1 ring-accent/40" : "border-border hover:border-stone-400"}`}
              >
                <div className="aspect-[4/3] bg-stone-100 relative" style={{ backgroundColor: safeHexBackground(wall.wall_color_hex, "#E5E1DA") }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={picture} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                </div>
                <p className="px-2 py-1.5 text-[11px] text-foreground truncate">{wall.name}</p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
