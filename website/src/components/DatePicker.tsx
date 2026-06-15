"use client";

import { useEffect, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";

interface DatePickerProps {
  /** ISO 8601 date string (YYYY-MM-DD) or empty string. */
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  className?: string;
}

function parseISODate(iso: string | undefined | null): Date | undefined {
  if (!iso) return undefined;
  // Accept both "YYYY-MM-DD" and full ISO strings.
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function toISODate(d: Date): string {
  // Always return YYYY-MM-DD (local-timezone safe).
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDisplay(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Branded date picker built on react-day-picker. Replaces native
 * <input type="date"> to give consistent look and behaviour across
 * browsers (Safari on macOS, Chromium, Firefox all render the native
 * widget very differently).
 *
 * Emits and accepts `YYYY-MM-DD` strings to stay compatible with
 * Supabase `date` columns and existing callers.
 */
export default function DatePicker({
  value,
  onChange,
  label,
  placeholder = "Select a date",
  min,
  max,
  disabled,
  className = "",
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const selected = parseISODate(value);
  const minDate = parseISODate(min);
  const maxDate = parseISODate(max);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      {label && <label className="block text-xs font-medium text-muted mb-1.5">{label}</label>}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm bg-background border border-border rounded-sm text-left hover:border-foreground/40 focus:outline-none focus:border-accent/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className={selected ? "text-foreground" : "text-muted"}>
          {selected ? formatDisplay(selected) : placeholder}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-muted shrink-0">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 bg-surface border border-border rounded-sm shadow-lg p-3">
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={(d) => {
              if (d) {
                onChange(toISODate(d));
                setOpen(false);
              } else {
                onChange("");
              }
            }}
            disabled={[
              ...(minDate ? [{ before: minDate }] : []),
              ...(maxDate ? [{ after: maxDate }] : []),
            ]}
            classNames={{
              root: "text-sm",
              month_caption: "flex items-center justify-center py-1 mb-1 font-medium text-foreground",
              nav: "flex items-center justify-between absolute inset-x-2 top-2",
              button_previous: "w-7 h-7 flex items-center justify-center text-muted hover:text-foreground rounded-sm hover:bg-background",
              button_next: "w-7 h-7 flex items-center justify-center text-muted hover:text-foreground rounded-sm hover:bg-background",
              chevron: "fill-current",
              table: "border-collapse",
              weekdays: "text-[10px] uppercase tracking-wider text-muted",
              weekday: "px-2 py-1 font-normal",
              day: "p-0",
              day_button: "w-11 h-11 text-xs rounded-sm hover:bg-accent/10 cursor-pointer transition-colors disabled:opacity-30 disabled:cursor-not-allowed",
              selected: "!bg-accent !text-white hover:!bg-accent-hover",
              today: "font-bold text-accent",
              outside: "text-muted/50",
            }}
            weekStartsOn={1}
          />
          {selected && (
            <div className="mt-2 pt-2 border-t border-border flex justify-end">
              <button
                type="button"
                onClick={() => { onChange(""); setOpen(false); }}
                className="text-xs text-muted hover:text-foreground underline"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
