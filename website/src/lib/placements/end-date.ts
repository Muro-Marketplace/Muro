// placements.end_date, the planned end of a placement (migration 136).
//
// A plain calendar date, not a timestamp. Every other date column on
// `placements` records a PAST event stamped by the server; this one is a
// forward-looking intention both parties agree on, so a time of day would be
// false precision.
//
// Two invariants live here rather than in the route, so the API, the cron and
// the UI cannot each grow their own version:
//
//   1. NULL is a value, not a gap. An open-ended placement is legitimate, so
//      clearing the date back to null is a first-class action.
//   2. The date never drives status. Reaching it sends reminders; the work is
//      physically on the wall until a human confirms collection. Nothing in
//      this module returns anything a status write could key on.

/** YYYY-MM-DD, the shape an <input type="date"> and a Postgres DATE agree on. */
const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type EndDateResult =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

/**
 * True when `input` is a YYYY-MM-DD string naming a real calendar day.
 *
 * The round trip is what rejects 2026-02-31: the regex alone would pass it,
 * and an engine that rolls the overflow forward would silently store 3 March
 * against a user who meant something else.
 */
export function isPlainDate(input: unknown): input is string {
  if (typeof input !== "string" || !PLAIN_DATE.test(input)) return false;
  const ms = Date.parse(`${input}T00:00:00.000Z`);
  if (Number.isNaN(ms)) return false;
  return new Date(ms).toISOString().slice(0, 10) === input;
}

/**
 * The UTC calendar day an ISO timestamp falls on, or null.
 *
 * UTC on purpose: `created_at` is stored in UTC and the comparison below is
 * between two calendar days, so reading it in the server's local zone would
 * make "before the placement was created" answer differently depending on
 * where the code runs.
 */
export function toPlainDate(ts: string | null | undefined): string | null {
  if (!ts) return null;
  if (isPlainDate(ts)) return ts;
  const ms = Date.parse(ts);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Validate a caller-supplied end date for a placement.
 *
 * `null` clears the date (open ended). A date before the placement existed is
 * refused: it cannot describe an intention, only a typo, and it would put the
 * ending-soon reminder permanently in the past.
 *
 * A date in the past but after creation is deliberately ALLOWED. A placement
 * that overran and is being recorded after the fact is a real case, and the
 * date does not end anything by itself, so refusing it would only stop people
 * writing down what actually happened.
 */
export function validateEndDate(
  input: unknown,
  placementCreatedAt: string | null | undefined,
): EndDateResult {
  if (input === null) return { ok: true, value: null };
  if (!isPlainDate(input)) {
    return { ok: false, error: "End date must be a real date, in YYYY-MM-DD form." };
  }
  const createdDay = toPlainDate(placementCreatedAt);
  if (createdDay && input < createdDay) {
    return { ok: false, error: "End date can't be before the placement was created." };
  }
  return { ok: true, value: input };
}

/**
 * "8 May 2026", for email bodies and read-only UI.
 *
 * Formatted at midday UTC so a plain DATE cannot slip to the previous day for
 * a reader west of Greenwich, which is how "ends 8 May" becomes "ends 7 May"
 * in an inbox.
 */
export function formatEndDate(date: string | null | undefined): string | null {
  if (!isPlainDate(date)) return null;
  return new Date(`${date}T12:00:00.000Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * The line both portals show. Factual on purpose: an end date is a plan, so
 * the copy says when the parties intend to take the work down and nothing
 * about the placement ending on its own.
 */
export function endDateLabel(date: string | null | undefined): string {
  const formatted = formatEndDate(date);
  return formatted ? `Ends on ${formatted}` : "Open ended";
}

/**
 * How far ahead of the end date the "ending soon" reminder goes out.
 *
 * Lives here rather than in the cron because the portal copy promises it to
 * the user, and a client component must not import a route module to read a
 * number. One definition, two readers.
 */
export const ENDING_SOON_NOTICE_DAYS = 14;

/** The UTC calendar day `days` whole days after `from`. */
export function plainDateInDays(days: number, from: Date = new Date()): string {
  const utcMidnight = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  return new Date(utcMidnight + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
