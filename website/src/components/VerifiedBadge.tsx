/**
 * Subtle "Verified" trust pill for artists who've passed admin review.
 *
 * Mirrors the Featured chip pattern but without the accent fill, since
 * Verified should be quieter than the Pro-tier signal — it's a hygiene
 * indicator, not a promotional one.
 */
export default function VerifiedBadge({
  size = "md",
  className = "",
}: {
  size?: "sm" | "md";
  className?: string;
}) {
  const dim = size === "sm" ? 11 : 13;
  const padding = size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]";
  return (
    <span
      title="Verified artist — reviewed and approved by Wallplace"
      aria-label="Verified artist"
      className={`inline-flex items-center gap-1 rounded-full bg-accent/10 text-accent font-medium tracking-wide ${padding} ${className}`}
    >
      <svg
        width={dim}
        height={dim}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M9 12l2 2 4-4" />
      </svg>
      Verified
    </span>
  );
}
