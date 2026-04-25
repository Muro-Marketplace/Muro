"use client";

/**
 * Combobox — a typeable + searchable dropdown.
 *
 * Behaves like a `<select>` for the common case but also lets users
 * type to filter the option list and (when `allowCustom` is on)
 * commit a free-text value not in the list. Used for the artwork
 * Medium picker — there are dozens of standard mediums but artists
 * always have edge cases ("oil + gold leaf", "spray + linocut"), so
 * a rigid select frustrates and a plain text input loses the
 * suggestions.
 *
 * Keyboard:
 *   - ArrowUp / ArrowDown  navigate filtered list
 *   - Enter                pick the highlighted suggestion (or commit
 *                          the typed text when allowCustom)
 *   - Escape               close, restoring the prior value
 *
 * Click-out closes the menu without committing.
 */

import { useEffect, useMemo, useRef, useState } from "react";

interface Props {
  value: string;
  onChange: (next: string) => void;
  options: readonly string[];
  /** Placeholder shown when value is empty. */
  placeholder?: string;
  /** Whether to allow the user to commit free text not in `options`. */
  allowCustom?: boolean;
  /** Required affordance (asterisk + aria-required). */
  required?: boolean;
  /** Forwarded to the input — disables editing entirely. */
  disabled?: boolean;
  /** Forwarded to the input className. Keep it consistent with form
   *  inputs around it. */
  className?: string;
  id?: string;
  name?: string;
}

export default function Combobox({
  value,
  onChange,
  options,
  placeholder,
  allowCustom = false,
  required,
  disabled,
  className = "",
  id,
  name,
}: Props) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external value → input text when the parent updates us.
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Filtered list — case-insensitive prefix-then-substring ordering so
  // typing "oil" surfaces "Oil paint" before "Charcoal & oil pastel".
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice();
    return options
      .filter((o) => o.toLowerCase().includes(q))
      .sort((a, b) => {
        const aStart = a.toLowerCase().startsWith(q) ? 0 : 1;
        const bStart = b.toLowerCase().startsWith(q) ? 0 : 1;
        if (aStart !== bStart) return aStart - bStart;
        return a.length - b.length;
      });
  }, [query, options]);

  // Click-outside closes.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery(value); // restore committed value
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open, value]);

  function commit(next: string) {
    onChange(next);
    setQuery(next);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, Math.max(0, filtered.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlight]) {
        commit(filtered[highlight]);
      } else if (allowCustom && query.trim()) {
        commit(query.trim());
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery(value);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-required={required}
        required={required}
        disabled={disabled}
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        // Visual cue that this is a dropdown — the chevron is purely
        // decorative; the whole input is interactive.
        className={`${className} pr-8`}
      />
      {/* Chevron */}
      <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted">
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 5l3 3 3-3" />
        </svg>
      </span>

      {open && (filtered.length > 0 || (allowCustom && query.trim())) && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 left-0 right-0 max-h-64 overflow-y-auto rounded-sm bg-white border border-border shadow-lg"
        >
          {filtered.map((opt, i) => {
            const active = i === highlight;
            const isCurrent = opt === value;
            return (
              <li key={opt}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isCurrent}
                  onMouseEnter={() => setHighlight(i)}
                  onMouseDown={(e) => {
                    // mousedown so we run before the input's blur clears state.
                    e.preventDefault();
                    commit(opt);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? "bg-accent/10 text-foreground"
                      : "text-foreground hover:bg-stone-50"
                  } ${isCurrent ? "font-medium" : ""}`}
                >
                  {opt}
                </button>
              </li>
            );
          })}
          {/*
           * Allow-custom: when the user types something not in the
           * list, surface a "Use 'foo'" entry so they can commit
           * free text without leaving the keyboard.
           */}
          {allowCustom &&
            query.trim() &&
            !filtered.some(
              (o) => o.toLowerCase() === query.trim().toLowerCase(),
            ) && (
              <li>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commit(query.trim());
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm text-accent hover:bg-stone-50"
                >
                  Use &ldquo;{query.trim()}&rdquo;
                </button>
              </li>
            )}
        </ul>
      )}
    </div>
  );
}
