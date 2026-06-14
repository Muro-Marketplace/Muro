// Single owner for PostgREST .or() filters built from untrusted values.
// PostgREST uses commas as term separators and parens for and()/or() groups,
// so a value containing them can inject extra filter terms. A term is kept
// only if it matches column.operator.value with a value charset that excludes
// commas and parens. Dots, plus, percent, at and hyphen are allowed so normal
// emails, slugs and UUIDs pass.
const SAFE_TERM =
  /^[a-zA-Z_][a-zA-Z0-9_]*\.(eq|neq|gt|gte|lt|lte|like|ilike|in|is)\.[A-Za-z0-9_@%+.\-]+$/;

/**
 * Join only the terms whose value is safe to interpolate into .or().
 *
 * Fails CLOSED: if no safe terms remain after filtering, throws rather than
 * returning an empty string. An empty .or("") in PostgREST can widen the
 * query to every row, which is a data leak. In normal operation the first
 * term is always a trusted server-side id (userId/slug) that survives, so
 * this throw is unreachable for legitimate traffic.
 */
export function orFilter(terms: string[]): string {
  const safe = terms.filter((t) => SAFE_TERM.test(t));
  if (safe.length === 0) {
    throw new Error(
      "orFilter: no safe terms; refusing to build an empty .or() filter that could match all rows"
    );
  }
  return safe.join(",");
}
