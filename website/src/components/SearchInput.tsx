"use client";

import { useEffect, useState } from "react";

interface SearchInputProps {
  /** Current search value, owned by the parent. */
  value: string;
  /** Fired with the debounced value. */
  onChange: (next: string) => void;
  placeholder?: string;
  /** Debounce window. 200ms is the sweet spot for type-as-you-go. */
  debounceMs?: number;
  className?: string;
}

/**
 * Debounced text input with an inline clear button. Owns its local
 * state to avoid blocking the parent on every keystroke; emits the
 * settled value through onChange after debounceMs of quiet.
 *
 * Distinct from <SearchBar/>, which is the global header autocomplete
 * that navigates to artist pages. Use <SearchInput/> wherever you need
 * a primitive text filter wired to local state.
 */
export default function SearchInput({
  value,
  onChange,
  placeholder = "Search",
  debounceMs = 200,
  className = "",
}: SearchInputProps) {
  const [local, setLocal] = useState(value);

  useEffect(() => setLocal(value), [value]);

  useEffect(() => {
    if (local === value) return;
    const t = setTimeout(() => onChange(local), debounceMs);
    return () => clearTimeout(t);
  }, [local, value, onChange, debounceMs]);

  return (
    <div className={`relative ${className}`}>
      <input
        type="search"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full pl-9 pr-9 py-2 bg-background border border-border rounded-sm text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/60 transition-colors"
      />
      <svg
        aria-hidden
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
      >
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      {local.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setLocal("");
            onChange("");
          }}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted hover:text-foreground"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="6" y1="18" x2="18" y2="6" />
          </svg>
        </button>
      )}
    </div>
  );
}
