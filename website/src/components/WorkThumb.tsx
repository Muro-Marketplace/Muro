"use client";

import Image from "next/image";

/**
 * The small square thumbnail that identifies a piece of work in a portal list:
 * an enquiry, an offer, an order line, a message thread, a notification, an
 * analytics row.
 *
 * Portals used to name a work in text alone. An artist reading "Enquiry about
 * Harbour Light" had to remember which piece that was, and the answer was
 * usually a picture they had uploaded themselves. Placements already showed a
 * thumbnail and was the only surface that did; this is that idiom, extracted so
 * every surface renders it the same way.
 *
 * `object-cover` on a fixed square, not the matted presentation card in
 * ArtworkThumb: at 32-64px a mat leaves almost no image, and these are
 * identifiers in a row rather than the artwork on display.
 *
 * A missing image renders the placeholder rather than an empty frame. The
 * inline copy at the placements call sites passed `src=""` for a work with no
 * image, which Next's Image rejects, so this is also the fix for that.
 */
interface WorkThumbProps {
  /** Artwork image URL. Empty, null or undefined all render the placeholder. */
  src?: string | null;
  /** The work's title. Used as alt text, so pass the real title. */
  alt: string;
  size?: keyof typeof SIZES;
  className?: string;
}

// Tailwind needs literal class names, so the sizes are a lookup rather than
// interpolation.
const SIZES = {
  xs: { box: "w-6 h-6", px: "24px" },
  sm: { box: "w-8 h-8", px: "32px" },
  md: { box: "w-10 h-10", px: "40px" },
  lg: { box: "w-12 h-12", px: "48px" },
  xl: { box: "w-16 h-16", px: "64px" },
} as const;

export default function WorkThumb({ src, alt, size = "md", className = "" }: WorkThumbProps) {
  const { box, px } = SIZES[size];
  const url = src?.trim();
  const shell = `${box} relative rounded-sm overflow-hidden bg-border/20 shrink-0 ${className}`;

  if (!url) {
    return (
      <div className={`${shell} flex items-center justify-center`} aria-hidden="true">
        {/* Deliberately not an img with a placeholder file: one fewer request,
            and it tints with the surrounding text colour. */}
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted/60"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="m21 15-5-5L5 21" />
        </svg>
      </div>
    );
  }

  return (
    <div className={shell} data-protected="artwork">
      <Image
        src={url}
        alt={alt}
        fill
        sizes={px}
        className="object-cover pointer-events-none select-none"
        draggable={false}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}
