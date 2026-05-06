const HEX_RE = /^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/;

/** True if `value` is a 3- or 6-char hex digit string (no leading #). */
export function isValidHex(value: unknown): value is string {
  return typeof value === "string" && HEX_RE.test(value);
}

/** Return a CSS-safe `#xxxxxx` string, or the fallback if invalid. */
export function safeHexBackground(value: unknown, fallback: string): string {
  return isValidHex(value) ? `#${value}` : fallback;
}
