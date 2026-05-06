"use client";

import { useEffect, useState } from "react";

interface ImageWithFallbackProps {
  src: string | null | undefined;
  alt: string;
  className?: string;
  /** Override the placeholder text (default: first letter of alt, uppercased). */
  placeholderText?: string;
  /** Tailwind classes for the placeholder block. */
  placeholderClassName?: string;
  /** Lazy-load the image (defaults true). */
  loading?: "lazy" | "eager";
}

const DEFAULT_PLACEHOLDER_CLASSES =
  "bg-accent/10 text-accent flex items-center justify-center text-2xl font-medium";

/**
 * Plain <img> wrapper that swaps to a coloured block with a letter
 * when the image fails to load (or src is missing). Use this anywhere
 * a card might receive a broken / placeholder URL — wall cards, saved
 * items, artist photos, collection thumbnails.
 *
 * Keep next/image where it's already used — this wrapper only replaces
 * plain <img> calls that have no error handling.
 */
export default function ImageWithFallback({
  src,
  alt,
  className = "",
  placeholderText,
  placeholderClassName = DEFAULT_PLACEHOLDER_CLASSES,
  loading = "lazy",
}: ImageWithFallbackProps) {
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    setErrored(false);
  }, [src]);

  if (!src || errored) {
    const letter = (
      placeholderText ||
      alt.trim().charAt(0) ||
      "?"
    ).toUpperCase();
    return (
      <div
        role="img"
        aria-label={alt}
        className={`${className} ${placeholderClassName}`}
      >
        {letter}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      onError={() => setErrored(true)}
      className={className}
      loading={loading}
    />
  );
}
