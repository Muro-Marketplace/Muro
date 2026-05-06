const FORMATTER = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  currencyDisplay: "narrowSymbol",
});

/**
 * Always returns a £-prefixed string. Never £NaN, never undefined,
 * never throws. Caller can pass null / undefined / non-numeric and
 * receives £0.00. Negative values render as "-£12.50".
 *
 * For compact axis-label formatting (e.g. "£1.5k"), keep the local
 * formatPoundsCompact helper colocated with the chart that uses it.
 */
export function formatPounds(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "£0.00";
  return FORMATTER.format(value);
}

/**
 * Locale-aware currency formatter for orders that may be priced in
 * something other than GBP. Falls back to GBP for missing/blank
 * currency. Non-numeric amounts render as "£0.00" via formatPounds —
 * we don't surface "USD 0.00" because the only path that hits this
 * with a non-GBP currency is an authenticated order detail, where
 * a missing total is a bug worth flagging the same way as elsewhere.
 */
const ISO_4217 = /^[A-Z]{3}$/;

export function formatCurrency(value: unknown, currency?: string | null): string {
  const code = (currency || "GBP").toUpperCase();
  if (code === "GBP" || !ISO_4217.test(code)) return formatPounds(value);
  if (typeof value !== "number" || !Number.isFinite(value)) return formatPounds(value);
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
    }).format(value);
  } catch {
    // Intl rejects truly invalid codes (e.g. "AAA") with RangeError —
    // fall back to GBP rather than letting it bubble.
    return formatPounds(value);
  }
}
