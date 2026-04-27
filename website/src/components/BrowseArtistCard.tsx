"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Artist } from "@/data/artists";
import { useAuth } from "@/context/AuthContext";
import { disciplineLabel } from "@/data/categories";

interface BrowseArtistCardProps {
  artist: Artist;
  distance: number | null;
}

export default function BrowseArtistCard({ artist, distance }: BrowseArtistCardProps) {
  const { userType } = useAuth();
  const [imgIndex, setImgIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState(0);
  const images = artist.works.map((w) => w.image);

  // Build a clean one-line summary using the three core methods; the
  // profile header shows the broad discipline (Photography, Painting…)
  // and the specific style lives in the chip row below.
  const offers: string[] = [];
  if (artist.openToRevenueShare) offers.push("Revenue Share");
  if (artist.openToFreeLoan) offers.push("Paid Loan");
  if (artist.openToOutrightPurchase) offers.push("Direct Purchase");
  const formats: string[] = [];
  if (artist.offersOriginals) formats.push("Originals");
  if (artist.offersPrints) formats.push("Prints");
  if (artist.offersFramed) formats.push("Framed");

  return (
    <Link href={`/browse/${artist.slug}`} className="group block">
      <div className="bg-surface border border-border/50 rounded-lg overflow-hidden flex flex-col h-full">
        {/* Image — square off-white "matting" frame so portrait,
            landscape, square, and panoramic carousel slides all sit
            uniformly without cropping the artist's work. The image
            itself uses object-contain so true aspect ratio is
            preserved. Wall visualisation surfaces still render the
            artwork at its true proportions; this treatment is
            display-only for browse/portfolio cards. */}
        <div
          className="aspect-square relative overflow-hidden bg-[#F0EDE8] rounded-t-lg select-none"
          onContextMenu={(e) => e.preventDefault()}
          onTouchStart={(e) => setTouchStartX(e.touches[0].clientX)}
          onTouchEnd={(e) => {
            const diff = touchStartX - e.changedTouches[0].clientX;
            if (Math.abs(diff) > 50) {
              if (diff > 0) setImgIndex((prev) => (prev + 1) % images.length);
              else setImgIndex((prev) => (prev - 1 + images.length) % images.length);
            }
          }}
        >
          {images.map((src, index) => (
            <div
              key={src}
              className={`absolute inset-0 transition-opacity duration-500 ${
                index === imgIndex ? "opacity-100" : "opacity-0 pointer-events-none"
              }`}
            >
              <div className="absolute inset-4 sm:inset-6">
                <Image
                  src={src}
                  alt={`${artist.works[index]?.title || "Artwork"} by ${artist.name}`}
                  fill
                  className="object-contain group-hover:scale-[1.03] transition-transform duration-700 pointer-events-none select-none"
                  sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                  draggable={false}
                  onContextMenu={(e) => e.preventDefault()}
                />
              </div>
            </div>
          ))}
          {/* Transparent overlay to block save-as */}
          <div className="absolute inset-0 pointer-events-none" />

          {/* Featured chip for Pro-tier artists. Subtle accent pill
              in the top-left so it's visible at a glance in the
              marketplace grid without competing with the heart at
              top-right. Pro tier earns this automatically — there's
              no manual curation step, the chip is purely a
              subscription-tier signal. */}
          {artist.subscriptionPlan === "pro" && (
            <div className="absolute top-2 left-2 z-10 pointer-events-none">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/95 text-white text-[10px] font-medium tracking-wide shadow-sm">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                Featured
              </span>
            </div>
          )}

          {/* Nav arrows — desktop hover only. Darker fill so they
              read against the off-white matting (the previous
              white/80 disappeared on the new background). */}
          {images.length > 1 && (
            <>
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setImgIndex((prev) => (prev - 1 + images.length) % images.length); }}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-foreground/80 text-white hover:bg-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20 shadow-sm"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setImgIndex((prev) => (prev + 1) % images.length); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-foreground/80 text-white hover:bg-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20 shadow-sm"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            </>
          )}

          {/* Dot indicators — minimal, dark on the off-white frame */}
          {images.length > 1 && (
            <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex gap-1 z-20">
              {images.map((_, i) => (
                <button
                  key={i}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setImgIndex(i); }}
                  className={`w-1 h-1 rounded-full transition-colors ${i === imgIndex ? "bg-foreground" : "bg-foreground/30"}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="px-4 py-3.5 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-medium text-foreground leading-tight">
              {artist.name}
            </h2>
            {distance !== null && (
              <span className="text-[10px] text-muted shrink-0">
                {distance < 0.2 ? "< 0.2 mi" : `${distance.toFixed(1)} mi`}
              </span>
            )}
          </div>
          <p className="text-xs text-muted mt-0.5">
            {disciplineLabel(artist.primaryMedium, artist.discipline)} · {artist.location}
          </p>
          {offers.length > 0 && (
            <p className="text-[11px] text-muted/70 mt-1">
              {offers.join(" · ")}
            </p>
          )}
          {artist.openToRevenueShare && artist.revenueSharePercent != null && artist.revenueSharePercent > 0 && !(userType === "customer") && (
            <p className="text-[11px] text-accent font-medium mt-1">
              {artist.revenueSharePercent}% Revenue Share
            </p>
          )}
          {formats.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2.5">
              {formats.map((f) => (
                <span
                  key={f}
                  className="text-[10px] text-muted/80 px-1.5 py-0.5 border border-border/70 rounded-sm"
                >
                  {f}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
