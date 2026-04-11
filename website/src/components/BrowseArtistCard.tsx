"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { Artist } from "@/data/artists";

interface BrowseArtistCardProps {
  artist: Artist;
  distance: number;
}

export default function BrowseArtistCard({ artist, distance }: BrowseArtistCardProps) {
  const router = useRouter();
  const [imgIndex, setImgIndex] = useState(0);
  const images = artist.works.map((w) => w.image);

  const goToPrev = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setImgIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  const goToNext = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setImgIndex((prev) => (prev + 1) % images.length);
  };

  const goToDot = (e: React.MouseEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setImgIndex(index);
  };

  return (
    <Link href={`/browse/${artist.slug}`} className="group block">
      <div className="bg-surface border border-border rounded-sm overflow-hidden hover:border-accent/30 hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
        {/* Image area */}
        <div className="aspect-square relative overflow-hidden bg-border/30">
          {images.map((src, index) => (
            <div
              key={src}
              className={`absolute inset-0 transition-opacity duration-500 ${
                index === imgIndex
                  ? "opacity-100 z-0"
                  : "opacity-0 pointer-events-none z-0"
              }`}
            >
              <Image
                src={src}
                alt={`Artwork by ${artist.name}`}
                fill
                className="object-cover"
                sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
              />
            </div>
          ))}

          {/* Left arrow */}
          {images.length > 1 && (
            <button
              onClick={goToPrev}
              aria-label="Previous image"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-20"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}

          {/* Right arrow */}
          {images.length > 1 && (
            <button
              onClick={goToNext}
              aria-label="Next image"
              className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-20"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          )}

          {/* Dot indicators */}
          {images.length > 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-20">
              {images.map((_, index) => (
                <button
                  key={index}
                  onClick={(e) => goToDot(e, index)}
                  aria-label={`Go to image ${index + 1}`}
                  className={`w-1.5 h-1.5 rounded-full transition-colors duration-200 ${
                    index === imgIndex ? "bg-white" : "bg-white/40"
                  }`}
                />
              ))}
            </div>
          )}

          {/* Founding Artist badge top-left */}
          <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-10">
            {artist.isFoundingArtist && (
              <span
                className="inline-block px-2.5 py-1 bg-white/95 text-xs font-medium text-foreground rounded-sm cursor-help"
                title="One of the first 20 artists on Wallspace – free access for life"
              >
                Founding Artist
              </span>
            )}
          </div>

          {/* Availability mini-badges top-right */}
          <div className="absolute top-3 right-3 flex flex-col gap-1 z-10">
            {artist.offersOriginals && (
              <span className="inline-block px-2 py-0.5 bg-black/60 text-white text-[10px] rounded-sm backdrop-blur-sm">
                Originals
              </span>
            )}
            {artist.offersPrints && (
              <span className="inline-block px-2 py-0.5 bg-black/60 text-white text-[10px] rounded-sm backdrop-blur-sm">
                Prints
              </span>
            )}
            {artist.offersFramed && (
              <span className="inline-block px-2 py-0.5 bg-black/60 text-white text-[10px] rounded-sm backdrop-blur-sm">
                Framed
              </span>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="p-4">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h2 className="text-base font-sans font-medium text-foreground leading-tight">
              {artist.name}
            </h2>
            <span className="text-xs text-muted shrink-0 mt-0.5">
              {distance < 1
                ? `${(distance * 5280).toFixed(0)} ft`
                : `${distance.toFixed(1)} mi`}
            </span>
          </div>
          <p className="text-sm text-muted mb-3">
            {artist.primaryMedium} &middot; {artist.location}
          </p>
          {/* Commercial terms */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {(artist.openToFreeLoan || artist.openToRevenueShare) && (
              <span className="text-[10px] text-accent bg-accent/5 border border-accent/15 px-1.5 py-0.5 rounded-sm">
                Display{artist.openToRevenueShare && artist.revenueSharePercent ? ` · ${artist.revenueSharePercent}% revenue share` : ""}
              </span>
            )}
            {artist.openToOutrightPurchase && (
              <span className="text-[10px] text-accent bg-accent/5 border border-accent/15 px-1.5 py-0.5 rounded-sm">Purchase</span>
            )}
          </div>
          {/* Hover action CTAs */}
          <div className="flex items-center gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                router.push(`/contact?artist=${artist.slug}`);
              }}
              className="px-3 py-1.5 text-xs font-medium border border-border rounded-sm text-foreground hover:border-accent hover:text-accent transition-colors cursor-pointer"
            >
              Send Message
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                router.push(`/browse/${artist.slug}`);
              }}
              className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-sm hover:bg-accent-hover transition-colors cursor-pointer"
            >
              Buy Now
            </button>
          </div>
        </div>
      </div>
    </Link>
  );
}
