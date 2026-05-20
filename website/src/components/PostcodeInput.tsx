// Dynamic postcode input (#11). Formats as the user types (uppercase
// + auto-inserted space before the inward code) and auto-attempts a
// geocode lookup once the value matches the UK postcode pattern. The
// "Go" button stays as an explicit fallback for users who don't want
// to wait for the debounce.
//
// Adds a "Use my location" button that calls the browser geolocation
// API, and remembers the last successful postcode in localStorage so
// switching between marketplace views doesn't ask twice.
//
// The component is purposefully presentational, geocoding is owned
// by the caller via `onGeocoded`. Keeps it reusable across the
// browse, spaces, and any future location-aware filter surfaces.

"use client";

import { useEffect, useRef, useState } from "react";
import { geocodePostcode } from "@/lib/geocode";

// Platform-specific instructions when the browser blocks geolocation.
// Detection runs client-side only (this is a "use client" file and the
// message only renders after a user gesture), so no hydration risk.
function deniedCopyForPlatform(): string {
  if (typeof navigator === "undefined") {
    return "Location permission was denied. Allow location in your browser settings, or enter your postcode below.";
  }
  const ua = navigator.userAgent || "";
  // Treat iPadOS-with-Mac-UA correctly: it presents as Macintosh but has touch.
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes("Macintosh") && typeof document !== "undefined" && "ontouchend" in document);
  const isAndroid = /Android/.test(ua);
  if (isIOS) {
    return "Location permission was denied. On iOS: open Settings → Privacy & Security → Location Services → Safari Websites → While Using, then refresh. Or just enter your postcode below.";
  }
  if (isAndroid) {
    return "Location permission was denied. Tap the lock icon next to the URL → Permissions → Location → Allow, then refresh. Or enter your postcode below.";
  }
  return "Location permission was denied. Click the lock icon in the address bar → Site settings → Location → Allow, then refresh. Or enter your postcode below.";
}

interface PostcodeInputProps {
  /** Initial value, a previously-entered postcode if any. */
  initial?: string;
  placeholder?: string;
  /** Fired when the postcode (or geolocation) resolves to coordinates. */
  onGeocoded: (coords: { lat: number; lng: number }, postcode: string) => void;
  /** Fired with `true` when the postcode looked valid but the geocoder
   *  rejected it; `false` when the user is typing again or the value
   *  resolves cleanly. The caller can use this to display an inline
   *  error message in their preferred style. */
  onError?: (failed: boolean) => void;
  /** Optional className for the wrapping container. */
  className?: string;
  /** Visual size, "sm" matches the filter sidebar; "md" matches the
   *  marketplace hero. Defaults to "sm". */
  size?: "sm" | "md";
  /** Hide the "Use my location" button (e.g. when the parent already
   *  has its own geolocation control). */
  hideMyLocation?: boolean;
}

/** Strict UK postcode pattern (after formatting). */
const UK_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s\d[A-Z]{2}$/;

const STORAGE_KEY = "wallplace-postcode";
const COORDS_STORAGE_KEY = "wallplace-coords";

/** Loose pre-format check, anything that contains only postcode-y
 *  characters (letters + digits + at most one space) so we don't
 *  persist things like "Current location" into the postcode input
 *  storage. The strict UK_POSTCODE check runs after `formatPostcode`. */
const POSTCODE_LIKE = /^[A-Za-z0-9\s]{2,10}$/;

/** Write the resolved coords + label so other pages can hydrate. Exported
 *  so non-PostcodeInput surfaces (e.g. /spaces hero) can share the same
 *  storage and a location set on one page persists on the others. */
export function persistLocation(coords: { lat: number; lng: number }, label: string): void {
  if (typeof window === "undefined") return;
  try {
    // Only write to STORAGE_KEY when the label looks like a postcode.
    // Geolocation hits ("Current location") still get the coords stored
    // for the chip via COORDS_STORAGE_KEY, but they must not pre-fill
    // the input, otherwise the next mount re-formats "Current location"
    // into "CURRENTLOCAT ION" and shows that to the user.
    if (POSTCODE_LIKE.test(label)) {
      window.localStorage.setItem(STORAGE_KEY, label);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    window.localStorage.setItem(
      COORDS_STORAGE_KEY,
      JSON.stringify({ lat: coords.lat, lng: coords.lng, label }),
    );
  } catch { /* ignore quota / Safari private mode */ }
}

/** Read previously-persisted coordinates so the parent can hydrate
 *  on mount without needing to re-prompt or re-geocode. */
export function readPersistedCoords(): { coords: { lat: number; lng: number }; label: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(COORDS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { lat?: number; lng?: number; label?: string };
    if (typeof parsed.lat !== "number" || typeof parsed.lng !== "number") return null;
    return {
      coords: { lat: parsed.lat, lng: parsed.lng },
      label: typeof parsed.label === "string" ? parsed.label : "",
    };
  } catch {
    return null;
  }
}

/** Drop persisted location, called when the user clicks "change". */
export function clearPersistedLocation(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(COORDS_STORAGE_KEY);
  } catch { /* ignore */ }
}

/** Format raw input → uppercase, single-spaced UK postcode form. */
function formatPostcode(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (cleaned.length <= 4) return cleaned;
  return `${cleaned.slice(0, -3)} ${cleaned.slice(-3)}`;
}

export default function PostcodeInput({
  initial = "",
  placeholder = "e.g. EC1A 1BB",
  onGeocoded,
  onError,
  className = "",
  size = "sm",
  hideMyLocation = false,
}: PostcodeInputProps) {
  // Hydrate from localStorage so users only enter a postcode once
  // per browser. Falls back to the `initial` prop if storage is empty
  // or unreadable (Safari private mode).
  const [value, setValue] = useState(() => {
    if (initial && POSTCODE_LIKE.test(initial)) return formatPostcode(initial);
    if (typeof window !== "undefined") {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        // Refuse stale junk like "Current location" written by an
        // older build, otherwise formatPostcode mangles it into
        // "CURRENTLOCAT ION" and shows that to the user. Clear it
        // out so future mounts don't keep falling into the same trap.
        if (stored) {
          if (POSTCODE_LIKE.test(stored)) return formatPostcode(stored);
          try {
            window.localStorage.removeItem(STORAGE_KEY);
          } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
    }
    return "";
  });
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  // Surface specific geolocation failures back to the user, silent
  // failure on mobile was the bug that prompted this rework. We
  // distinguish the three meaningful PositionError codes so the UI
  // can give actionable copy ("turn on location services" vs
  // "permission denied" vs "took too long"). Cleared on the next
  // successful resolve.
  const [geoError, setGeoError] = useState<null | "denied" | "unavailable" | "timeout">(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced auto-lookup once the value matches the full UK postcode
  // pattern. The user doesn't have to click Go, they just type.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!UK_POSTCODE.test(value)) return;
    debounceRef.current = setTimeout(async () => {
      setBusy(true);
      const coords = await geocodePostcode(value);
      setBusy(false);
      if (coords) {
        persistLocation(coords, value);
        onError?.(false);
        onGeocoded(coords, value);
      } else if (touched) {
        onError?.(true);
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, onGeocoded, onError, touched]);

  async function submit() {
    if (!value.trim()) return;
    setBusy(true);
    const coords = await geocodePostcode(value);
    setBusy(false);
    if (coords) {
      persistLocation(coords, value);
      onError?.(false);
      onGeocoded(coords, value);
    } else {
      onError?.(true);
    }
  }

  function useMyLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError("unavailable");
      return;
    }
    setGeoBusy(true);
    setGeoError(null);
    // Mobile-tuned options:
    //  • enableHighAccuracy: true, phones often refuse to return
    //    coarse fixes when the user has high-accuracy locked off; the
    //    fallback path was silently failing on iOS Safari.
    //  • timeout: 30s, coarse outdoor fixes can take ages on a cold
    //    GPS lock, especially indoors. 10s was hitting the limit.
    //  • maximumAge: 10 min, accept a recent cached fix instantly so
    //    repeat clicks don't all re-prompt.
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoBusy(false);
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        persistLocation(coords, "Current location");
        onError?.(false);
        onGeocoded(coords, "Current location");
      },
      (err) => {
        setGeoBusy(false);
        // Map the W3C PositionError codes → user-facing buckets so
        // we can show actionable copy. 1 = PERMISSION_DENIED,
        // 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT. Silent failure was
        // the bug, now we surface it.
        if (err.code === 1) setGeoError("denied");
        else if (err.code === 3) setGeoError("timeout");
        else setGeoError("unavailable");
      },
      { enableHighAccuracy: true, timeout: 30_000, maximumAge: 10 * 60_000 },
    );
  }

  const inputClass =
    size === "sm"
      ? "flex-1 min-w-0 px-2 py-1.5 bg-surface border border-border rounded-sm text-xs text-foreground focus:outline-none focus:border-accent/50 uppercase tracking-wide"
      : "flex-1 min-w-0 px-3 py-2.5 bg-surface border border-border rounded-sm text-sm text-foreground focus:outline-none focus:border-accent/50 uppercase tracking-wide";
  const buttonClass =
    size === "sm"
      ? "px-3 py-1.5 bg-accent text-white text-xs rounded-sm hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50"
      : "px-4 py-2.5 bg-accent text-white text-sm rounded-sm hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50";
  const linkClass =
    size === "sm"
      ? "text-[10px] text-muted hover:text-accent transition-colors flex items-center gap-1 mt-1.5"
      : "text-xs text-muted hover:text-accent transition-colors flex items-center gap-1 mt-2";

  return (
    <div className={className}>
      <div className="flex gap-1.5">
        <input
          type="text"
          autoComplete="postal-code"
          inputMode="text"
          value={value}
          onChange={(e) => {
            setValue(formatPostcode(e.target.value));
            setTouched(true);
            onError?.(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          className={inputClass}
          aria-label="Postcode"
        />
        <button
          type="button"
          onClick={submit}
          disabled={busy || !UK_POSTCODE.test(value)}
          className={buttonClass}
        >
          {busy ? "…" : "Go"}
        </button>
      </div>
      {!hideMyLocation && (
        <>
          <button
            type="button"
            onClick={useMyLocation}
            disabled={geoBusy}
            className={linkClass}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            </svg>
            {geoBusy ? "Locating…" : "Use my current location"}
          </button>
          {geoError && (
            <p className="text-[10px] text-red-600 mt-1 leading-snug">
              {geoError === "denied" && deniedCopyForPlatform()}
              {geoError === "timeout" &&
                "Couldn't get a location fix in time. Try again outdoors or enter your postcode."}
              {geoError === "unavailable" &&
                "Location isn't available on this device. Enter your postcode instead."}
            </p>
          )}
        </>
      )}
    </div>
  );
}
