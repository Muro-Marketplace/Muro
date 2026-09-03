"use client";

import { LABEL_THEMES, type LabelTheme, type LabelThemeId } from "@/lib/profile-themes";

interface LabelThemePickerProps {
  /** Currently selected theme id. A value that doesn't match a known
   *  theme just renders with nothing selected, callers already fall
   *  back to classic at render time via getLabelTheme. */
  value: string;
  onChange: (id: LabelThemeId) => void;
  /** Heading shown above the swatches. Pass "" to omit it when the
   *  surrounding panel already has its own heading. */
  label?: string;
}

/**
 * Small swatch picker for the four QR label colour schemes (classic, warm,
 * dark, accent). Shared by the artist and venue label-printing screens so
 * both pick from the same catalogue with the same look. Free for every
 * plan, artists and venues alike, owner decision 2026-09-02: this used to
 * live behind the Premium gate on Edit Profile, it doesn't any more.
 */
export default function LabelThemePicker({
  value,
  onChange,
  label = "Label colour",
}: LabelThemePickerProps) {
  return (
    <div>
      {label && (
        <p className="text-[10px] text-muted uppercase tracking-wider mb-1.5">{label}</p>
      )}
      <div className="grid grid-cols-4 gap-1.5">
        {LABEL_THEMES.map((theme) => (
          <LabelThemeSwatch
            key={theme.id}
            theme={theme}
            selected={value === theme.id}
            onPick={() => onChange(theme.id)}
          />
        ))}
      </div>
    </div>
  );
}

function LabelThemeSwatch({
  theme,
  selected,
  onPick,
}: {
  theme: LabelTheme;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={selected}
      title={theme.label}
      className={`text-left rounded-sm border overflow-hidden transition-colors ${
        selected ? "border-accent ring-1 ring-accent/40" : "border-border hover:border-foreground/30"
      }`}
    >
      {/* Minimal QR stand-in, enough to read the contrast at a glance */}
      <div className="aspect-square flex items-center justify-center" style={{ backgroundColor: theme.bg }}>
        <div className="w-4 h-4 grid grid-cols-3 gap-px" aria-hidden>
          {Array.from({ length: 9 }).map((_, i) => (
            <span
              key={i}
              className="block"
              style={{ backgroundColor: i % 2 === 0 ? theme.fg : theme.bg }}
            />
          ))}
        </div>
      </div>
      <p className="text-[9px] leading-tight text-center px-0.5 py-1 border-t border-border bg-surface text-foreground truncate">
        {theme.label}
      </p>
    </button>
  );
}
