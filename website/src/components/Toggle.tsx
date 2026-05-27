"use client";

/**
 * Shared on/off pill toggle, used in counter-offer dialogs and
 * placement context panels. Replaces a pair of near-identical inline
 * implementations that had drifted apart on width/offset, so the same
 * "Paid loan" and "QR display" controls rendered at slightly different
 * sizes depending on which surface you opened them from.
 *
 * Single visual language now:
 *  - on  → solid `bg-accent`, white thumb shifted right
 *  - off → `bg-border`, thumb at the left
 *  - thumb size is `w-4 h-4`, gap top-0.5 so it doesn't clip the pill
 *
 * The `size` prop only exists for the inline placement-list variant
 * that needs a slightly smaller footprint. Both variants share the
 * same colours, transition, and thumb so they read as one control.
 */
interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible label for screen readers when there isn't a visible
   *  one in the surrounding markup. Most callers wrap the toggle in a
   *  `<label>` with text, so this is optional. */
  ariaLabel?: string;
  /** Compact variant keeps the dot the same size but shrinks the track
   *  to fit dense inline panels. Defaults to the standard size. */
  size?: "standard" | "compact";
  /** Disable interaction and visually grey out. */
  disabled?: boolean;
}

export default function Toggle({
  checked,
  onChange,
  ariaLabel,
  size = "standard",
  disabled = false,
}: ToggleProps) {
  const track = size === "compact" ? "w-9 h-5" : "w-10 h-5";
  const dotOnX = size === "compact" ? "translate-x-[18px]" : "translate-x-[22px]";
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      aria-pressed={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      className={`relative shrink-0 ${track} rounded-full transition-colors ${
        checked ? "bg-accent" : "bg-border"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
          checked ? dotOnX : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
