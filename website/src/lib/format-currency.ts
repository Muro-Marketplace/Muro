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
