"use client";

import { useEffect, useRef, useState } from "react";

export interface DropdownOption<V extends string = string> {
  value: V;
  label: string;
  description?: string;
  disabled?: boolean;
}

interface DropdownProps<V extends string = string> {
  value: V | "";
  onChange: (value: V) => void;
  options: DropdownOption<V>[];
  placeholder?: string;
  /** Forwarded to the trigger button, useful for label-for / form errors. */
  id?: string;
  /** Adds a red border + a11y attr when set. */
  invalid?: boolean;
  required?: boolean;
  disabled?: boolean;
  /** Optional class merged with the default trigger styles. */
  className?: string;
  ariaLabel?: string;
}

/**
 * Custom dropdown that replaces the platform-themed <select>. Visual goals:
 *   - Looks like the rest of our inputs (rounded-sm, accent on focus).
 *   - Shows a description line per option when supplied (richer than native).
 *   - Keyboard friendly: Enter/Space to open, Up/Down/Enter/Escape to navigate.
 *   - Closes on outside click and on route change.
 * Doesn't try to be a full combobox, for searchable lists, build something more.
 */
export default function Dropdown<V extends string = string>({
  value,
  onChange,
  options,
  placeholder = "Select…",
  id,
  invalid,
  required,
  disabled,
  className,
  ariaLabel,
}: DropdownProps<V>) {
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState<number>(-1);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.value === value);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Sync highlight to current selection when opened
  useEffect(() => {
    if (open) {
      const idx = options.findIndex((o) => o.value === value);
      setHighlightIdx(idx >= 0 ? idx : 0);
    }
  }, [open, options, value]);

  function commit(v: V) {
    onChange(v);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "Tab") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => {
        let next = i;
        for (let step = 0; step < options.length; step++) {
          next = (next + 1 + options.length) % options.length;
          if (!options[next].disabled) return next;
        }
        return i;
      });
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => {
        let next = i;
        for (let step = 0; step < options.length; step++) {
          next = (next - 1 + options.length) % options.length;
          if (!options[next].disabled) return next;
        }
        return i;
      });
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const opt = options[highlightIdx];
      if (opt && !opt.disabled) commit(opt.value);
    }
  }

  const baseTrigger =
    "w-full bg-background border rounded-sm px-4 py-3 text-sm text-left flex items-center justify-between gap-2 transition-colors duration-150 focus:outline-none";
  const stateTrigger = disabled
    ? "opacity-50 cursor-not-allowed border-border"
    : invalid
      ? "border-red-400 focus:border-red-500"
      : open
        ? "border-accent/60 ring-1 ring-accent/20"
        : "border-border hover:border-foreground/30 focus:border-accent/60";

  return (
    <div ref={ref} className={`relative ${className || ""}`}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-required={required}
        aria-invalid={invalid}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={onKeyDown}
        className={`${baseTrigger} ${stateTrigger}`}
      >
        <span className={selected ? "text-foreground truncate" : "text-muted truncate"}>
          {selected ? selected.label : placeholder}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 text-muted transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <ul
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          className="absolute z-50 left-0 right-0 mt-1 max-h-72 overflow-y-auto bg-background border border-border rounded-sm shadow-lg py-1"
        >
          {options.length === 0 ? (
            <li className="px-3 py-2 text-xs text-muted">No options</li>
          ) : (
            options.map((opt, i) => {
              const isSelected = opt.value === value;
              const isHighlighted = i === highlightIdx;
              return (
                <li
                  key={opt.value || `__placeholder-${i}`}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={opt.disabled}
                  onMouseDown={(e) => {
                    e.preventDefault(); // keep focus on trigger so onClick commits cleanly
                    if (!opt.disabled) commit(opt.value);
                  }}
                  onMouseEnter={() => setHighlightIdx(i)}
                  className={`px-3 py-2 text-sm cursor-pointer flex items-start gap-2 ${
                    opt.disabled
                      ? "text-muted cursor-not-allowed"
                      : isHighlighted
                        ? "bg-accent/10 text-foreground"
                        : "text-foreground"
                  }`}
                >
                  <span className="flex-1 min-w-0">
                    <span className="block truncate">{opt.label}</span>
                    {opt.description && (
                      <span className="block text-[11px] text-muted mt-0.5">{opt.description}</span>
                    )}
                  </span>
                  {isSelected && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-accent shrink-0 mt-0.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
