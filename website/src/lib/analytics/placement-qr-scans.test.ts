// E17. The inline version in api/placements compared a display name against a
// slug and a uuid against a title, so every scan from a modern QR label was
// rejected and the per-placement count was near-guaranteed zero. These tests
// are written against the shapes the QR route actually writes.

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { placementQrScanCounts } from "./placement-qr-scans";

interface Rows {
  events?: Array<Record<string, unknown>>;
  works?: Array<{ id: string; title: string | null }>;
  eventsError?: { message: string };
}

/** Minimal PostgREST stub: `from(table).select(...).eq(...).in(...)` awaited. */
function db(rows: Rows): SupabaseClient {
  return {
    from(table: string) {
      const node: Record<string, unknown> = {};
      const self = () => node;
      for (const m of ["select", "eq", "in", "gte", "order", "limit"]) node[m] = self;
      node.then = (onOk: (v: unknown) => unknown) =>
        Promise.resolve(
          table === "analytics_events"
            ? { data: rows.events ?? [], error: rows.eventsError ?? null }
            : { data: rows.works ?? [], error: null },
        ).then(onOk);
      return node;
    },
  } as unknown as SupabaseClient;
}

const PLACEMENT = {
  id: "p-1",
  artist_slug: "maya-chen",
  venue_user_id: "venue-user-1",
  venue: "The Curzon",
  work_title: "Last Light on Mare Street",
};

function scan(over: Record<string, unknown> = {}) {
  return {
    artist_slug: "maya-chen",
    venue_user_id: "venue-user-1",
    venue_name: "The Curzon",
    work_id: "work-uuid-1",
    ...over,
  };
}

const WORKS = [{ id: "work-uuid-1", title: "Last Light on Mare Street" }];

describe("placementQrScanCounts", () => {
  it("counts a modern scan, which the old predicates threw away", async () => {
    // Fail-before: venue_name "The Curzon" was compared with venue_slug
    // "the-curzon", and work_id "work-uuid-1" with the work TITLE. Both failed.
    const counts = await placementQrScanCounts(db({ events: [scan(), scan()], works: WORKS }), [PLACEMENT]);
    expect(counts["p-1"]).toBe(2);
  });

  it("counts a legacy scan whose work_id is the title itself", async () => {
    const counts = await placementQrScanCounts(
      db({ events: [scan({ work_id: "Last Light on Mare Street", venue_user_id: null })], works: [] }),
      [PLACEMENT],
    );
    expect(counts["p-1"]).toBe(1);
  });

  it("attributes a legacy venue-name-only event to the right placement", async () => {
    const counts = await placementQrScanCounts(
      db({ events: [scan({ venue_user_id: null })], works: WORKS }),
      [PLACEMENT],
    );
    expect(counts["p-1"]).toBe(1);
  });

  it("counts a portfolio scan, which carries no work id", async () => {
    const counts = await placementQrScanCounts(
      db({ events: [scan({ work_id: null })], works: [] }),
      [PLACEMENT],
    );
    expect(counts["p-1"]).toBe(1);
  });

  it("does not count another venue's scan of the same artist", async () => {
    const counts = await placementQrScanCounts(
      db({ events: [scan({ venue_user_id: "venue-user-2", venue_name: "Foxglove & Co" })], works: WORKS }),
      [PLACEMENT],
    );
    expect(counts["p-1"]).toBe(0);
  });

  it("does not count another artist's scan", async () => {
    const counts = await placementQrScanCounts(
      db({ events: [scan({ artist_slug: "james-okafor" })], works: WORKS }),
      [PLACEMENT],
    );
    expect(counts["p-1"]).toBe(0);
  });

  it("does not count a scan of a work that is not on this placement", async () => {
    const counts = await placementQrScanCounts(
      db({
        events: [scan({ work_id: "work-uuid-9" })],
        works: [...WORKS, { id: "work-uuid-9", title: "Somewhere Else" }],
      }),
      [PLACEMENT],
    );
    expect(counts["p-1"]).toBe(0);
  });

  it("counts a scan of a work carried in extra_works", async () => {
    const counts = await placementQrScanCounts(
      db({
        events: [scan({ work_id: "work-uuid-9" })],
        works: [...WORKS, { id: "work-uuid-9", title: "Somewhere Else" }],
      }),
      [{ ...PLACEMENT, extra_works: [{ title: "Somewhere Else" }] }],
    );
    expect(counts["p-1"]).toBe(1);
  });

  it("splits scans between two placements of the same artist at the same venue", async () => {
    const counts = await placementQrScanCounts(
      db({
        events: [scan(), scan({ work_id: "work-uuid-9" }), scan({ work_id: "work-uuid-9" })],
        works: [...WORKS, { id: "work-uuid-9", title: "Somewhere Else" }],
      }),
      [PLACEMENT, { ...PLACEMENT, id: "p-2", work_title: "Somewhere Else" }],
    );
    expect(counts).toEqual({ "p-1": 1, "p-2": 2 });
  });

  it("returns a zero for every placement when there are no events", async () => {
    const counts = await placementQrScanCounts(db({ events: [] }), [PLACEMENT, { ...PLACEMENT, id: "p-2" }]);
    expect(counts).toEqual({ "p-1": 0, "p-2": 0 });
  });

  it("returns zeros and logs when the analytics read fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const counts = await placementQrScanCounts(db({ eventsError: { message: "relation missing" } }), [PLACEMENT]);
    expect(counts).toEqual({ "p-1": 0 });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("does not query at all when no placement names an artist", async () => {
    const counts = await placementQrScanCounts(db({}), [{ id: "p-1" }]);
    expect(counts).toEqual({ "p-1": 0 });
  });
});
