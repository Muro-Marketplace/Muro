"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

interface ArtistCarouselCardProps {
  name: string;
  slug: string;
  medium: string;
  location: string;
  images: string[];
  profileImage: string;
  isFoundingArtist: boolean;
  styleTags: string[];
  offersOriginals: boolean;
  offersPrints: boolean;
  offersFramed: boolean;
  openToFreeLoan: boolean;
  openToRevenueShare: boolean;
  openToOutrightPurchase: boolean;
}

export default function ArtistCarousel({
  name,
  slug,
  medium,
  location,
  images,
  offersOriginals,
  offersPrints,
  offersFramed,
  openToFreeLoan,
  openToRevenueShare,
  openToOutrightPurchase,
}: ArtistCarouselCardProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const { user, userType } = useAuth();
  const router = useRouter();

  // Logged-out users used to land on /contact?artist=…, a one-shot
  // form with no continuation. Now we route through customer signup
  // (#2) so the conversation has a portal home; signed-in users go
  // straight to whichever portal Messages they belong to.
  const messageHref = (() => {
    if (user && userType === "venue") {
      return `/venue-portal/messages?artist=${slug}&artistName=${encodeURIComponent(name)}`;
    }
    if (user && userType === "artist") {
      return `/artist-portal/messages?artist=${slug}&artistName=${encodeURIComponent(name)}`;
    }
    if (user && userType === "customer") {
      return `/customer-portal/messages?artist=${slug}&artistName=${encodeURIComponent(name)}`;
    }
    const next = `/customer-portal/messages?artist=${slug}&artistName=${encodeURIComponent(name)}`;
    return `/signup/customer?next=${encodeURIComponent(next)}`;
  })();

  const goToPrev = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  const goToNext = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % images.length);
  };

  const goToDot = (e: React.MouseEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentIndex(index);
  };

  const commercialTags: string[] = [];
  if (openToFreeLoan || openToRevenueShare) commercialTags.push("Display");
  if (openToOutrightPurchase) commercialTags.push("Purchase");

  return (
    <Link href={`/browse/${slug}`} className="block group">
      <div className="bg-surface border border-border rounded-sm overflow-hidden">
        {/* Image area */}
        <div className="relative aspect-square overflow-hidden">
          {images.map((src, index) => (
            <div
              key={src}
              className={`absolute inset-0 transition-opacity duration-500 ${
                index === currentIndex ? "opacity-100 z-0" : "opacity-0 pointer-events-none z-0"
              }`}
            >
              <Image
                src={src}
                alt={`Artwork by ${name}`}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              />
            </div>
          ))}

          {/* Left arrow */}
          {images.length > 1 && (
            <button
              onClick={goToPrev}
              aria-label="Previous image"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-20"
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
              className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-20"
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
                    index === currentIndex ? "bg-white" : "bg-white/40"
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Artist info */}
        <div className="p-4">
          <p className="text-base font-medium">{name}</p>
          <p className="text-sm text-muted mt-0.5">
            {medium} &middot; {location}
          </p>
          {commercialTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {commercialTags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs border border-accent/20 bg-accent/5 text-accent rounded-sm px-2 py-0.5"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 mt-3">
            <a
              href={messageHref}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                router.push(messageHref);
              }}
              className="px-3 py-1.5 text-xs font-medium border border-border rounded-sm text-foreground hover:border-accent hover:text-accent transition-colors"
            >
              Send Message
            </a>
            <a
              href={`/browse/${slug}?intent=buy`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                window.location.href = `/browse/${slug}?intent=buy`;
              }}
              className="px-4 py-1.5 text-xs font-medium bg-accent text-white rounded-sm hover:bg-accent-hover transition-colors"
            >
              Buy Now
            </a>
          </div>
        </div>
      </div>
    </Link>
  );
}
