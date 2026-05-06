// Diacritics that NFD doesn't decompose (Nordic + a few common edge cases).
// Applied before the NFD pass so the catch-everything "drop combining
// marks" sweep doesn't have to special-case them.
const PRE_NFD_MAP: Record<string, string> = {
  ø: "o",
  Ø: "O",
  æ: "ae",
  Æ: "AE",
  ß: "ss",
  œ: "oe",
  Œ: "OE",
  ð: "d",
  Ð: "D",
  þ: "th",
  Þ: "Th",
};

const PRE_NFD_RE = new RegExp(
  Object.keys(PRE_NFD_MAP)
    .map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|"),
  "g",
);

/**
 * URL-safe slug. Lowercases, strips accents (NFD + diacritic drop),
 * substitutes Nordic chars (ø, æ, ß, …), drops emoji and any other
 * non-alphanumeric, and collapses runs of separators into single
 * hyphens with no leading/trailing hyphen.
 *
 * Returns "" for inputs with no alphanumerics — callers should pick a
 * fallback (e.g. an id) rather than relying on the slug being non-empty.
 */
export function slugify(text: string): string {
  return text
    .replace(PRE_NFD_RE, (m) => PRE_NFD_MAP[m] ?? m)
    .normalize("NFD")
    // Drop combining marks (the diacritics that NFD just split off).
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
