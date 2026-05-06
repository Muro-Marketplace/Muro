// Country-aware postcode validation for checkout and address forms.
// Coverage: GB, US, CA at strict regex; everything else gets the
// fallback 1–20 char non-empty rule (we don't pretend to know every
// country's format).

const PATTERNS: Record<string, RegExp> = {
  GB: /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i,
  US: /^\d{5}(-\d{4})?$/,
  CA: /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i,
};

export function isValidPostcode(value: string, country: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 20) return false;
  const pattern = PATTERNS[country.toUpperCase()];
  if (pattern) return pattern.test(trimmed);
  return true; // unsupported country — accept any non-empty 1-20
}
