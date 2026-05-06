interface SkeletonProps {
  className?: string;
}

/**
 * Generic loading-shimmer block. Sized by the caller via Tailwind
 * width / height classes. Uses Tailwind's built-in animate-pulse for
 * the shimmer; aria-hidden so screen readers don't announce it.
 *
 * Don't reach for this for indeterminate spinners — Skeleton is
 * specifically for "we know roughly what's coming, show its shape".
 */
export default function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={`animate-pulse bg-border/40 rounded-sm ${className}`}
    />
  );
}
