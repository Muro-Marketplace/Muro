interface Props {
  /** Distance in miles. If null, renders nothing. */
  distance: number | null;
  /** Which image corner to pin to. Default: bottom-left. */
  corner?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
}

const CORNER_CLASS: Record<NonNullable<Props["corner"]>, string> = {
  "top-left": "top-2 left-2",
  "top-right": "top-2 right-2",
  "bottom-left": "bottom-2 left-2",
  "bottom-right": "bottom-2 right-2",
};

/**
 * Distance-from-you label that floats in a card corner. Just text +
 * the pin glyph, no pill — the card already has its own background;
 * a second one stacked over it competed with the title visually.
 * Rendered only when distance is known (viewer has set a postcode on
 * /browse AND the card subject has coordinates). Non-interactive
 * (`pointer-events-none`) so it never swallows clicks meant for the
 * card link beneath it.
 */
export default function DistanceBadge({ distance, corner = "bottom-left" }: Props) {
  if (distance === null) return null;
  const label = distance < 0.2 ? "< 0.2 mi" : `${distance.toFixed(1)} mi`;
  return (
    <span
      className={`absolute ${CORNER_CLASS[corner]} z-20 inline-flex items-center gap-1 text-[10px] font-medium tracking-wide text-muted pointer-events-none`}
    >
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
      {label}
    </span>
  );
}
