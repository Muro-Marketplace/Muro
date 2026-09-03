/**
 * Rewrite the /browse query string in place.
 *
 * Every writer on the browse page (search box, view switch, discipline
 * pills, the filter mirror and the location controls) goes through here,
 * for two reasons:
 *
 *   1. It reads the LIVE URL (`window.location.search`), never the
 *      `useSearchParams()` snapshot. The snapshot lags behind writes made
 *      by other controls, so a writer that merged from it could drop a
 *      change another control had just made.
 *   2. It uses `window.history.replaceState`, which this Next version syncs
 *      into the App Router (usePathname / useSearchParams update) without a
 *      soft navigation. `router.replace` starts a round trip to the server,
 *      and when it landed it committed the URL it was given when it
 *      started, wiping any change made while it was in flight. That is how
 *      typing in the search box reset the distance slider.
 *
 * `mutate` edits the params in place, or returns a replacement set (the
 * location serialiser builds a fresh one).
 */
export function writeBrowseQuery(
  mutate: (params: URLSearchParams) => URLSearchParams | void,
): void {
  if (typeof window === "undefined") return;
  const current = new URLSearchParams(window.location.search);
  const next = mutate(current) ?? current;
  const qs = next.toString();
  window.history.replaceState(null, "", qs ? `/browse?${qs}` : "/browse");
}

/** The live query string without its leading "?". */
export function liveBrowseQuery(): string {
  if (typeof window === "undefined") return "";
  return window.location.search.replace(/^\?/, "");
}
