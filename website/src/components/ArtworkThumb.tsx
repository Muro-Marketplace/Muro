"use client";

import Image from "next/image";

interface ArtworkThumbProps {
  src: string;
  alt: string;
  sizes?: string;
  className?: string;
  imageClassName?: string;
  quality?: number;
  priority?: boolean;
  padding?: "sm" | "md" | "lg";
}

const PADDING_CLASSES = {
  sm: "inset-2 sm:inset-2.5",
  md: "inset-2.5 sm:inset-3.5",
  lg: "inset-4 sm:inset-5",
} as const;

// Square presentation card for browsing/portfolio thumbnails. Mats the
// uploaded artwork on a warm off-white square so portrait, landscape,
// and panoramic works all sit in a uniform grid without cropping. The
// image keeps its real aspect ratio via object-contain. Wall visualiser
// surfaces (canvas, 3D scene, room mockups) must NOT use this — they
// need the artwork rendered at its true proportions.
export default function ArtworkThumb({
  src,
  alt,
  sizes,
  className = "",
  imageClassName = "",
  quality,
  priority,
  padding = "md",
}: ArtworkThumbProps) {
  return (
    <div className={`aspect-square relative overflow-hidden bg-[#F0EDE8] ${className}`}>
      <div className={`absolute ${PADDING_CLASSES[padding]}`}>
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          quality={quality}
          priority={priority}
          className={`object-contain pointer-events-none select-none ${imageClassName}`}
          draggable={false}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>
    </div>
  );
}
