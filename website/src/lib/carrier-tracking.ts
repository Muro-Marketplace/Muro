// Best-effort carrier lookup from a UK-shipping-tracking number. Not
// perfect — same-format collisions exist between FedEx and DHL — but
// good enough for a "tap to track" link. Falls back to null when we
// can't identify the carrier; UI then falls back to plain text.

interface Pattern {
  test: RegExp;
  url: (n: string) => string;
}

const PATTERNS: Pattern[] = [
  // UPS: starts with 1Z plus 16 alphanumeric chars
  {
    test: /^1Z[A-Z0-9]{16}$/i,
    url: (n) => `https://www.ups.com/track?tracknum=${encodeURIComponent(n)}`,
  },
  // Royal Mail: 2 letters, 9 digits, 2 letters (commonly ending in GB)
  {
    test: /^[A-Z]{2}\d{9}[A-Z]{2}$/,
    url: (n) =>
      `https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(n)}`,
  },
  // FedEx: 12 digits (also matches some other carriers; FedEx is the most common in this format)
  {
    test: /^\d{12}$/,
    url: (n) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(n)}`,
  },
  // DHL Express: 10 digits
  {
    test: /^\d{10}$/,
    url: (n) =>
      `https://www.dhl.com/en/express/tracking.html?AWB=${encodeURIComponent(n)}`,
  },
];

export function detectCarrierUrl(
  trackingNumber: string | null | undefined,
): string | null {
  if (typeof trackingNumber !== "string") return null;
  const trimmed = trackingNumber.trim();
  if (trimmed.length === 0) return null;
  for (const p of PATTERNS) {
    if (p.test.test(trimmed)) return p.url(trimmed);
  }
  return null;
}
