/**
 * Tests for the idempotency claim helpers.
 *
 * We need to verify:
 * 1. claimPending returns the updated row when the conditional update matches one row.
 * 2. claimPending returns null when zero rows match (already claimed or not pending).
 * 3. claimPending throws when the underlying update returns an error (real DB
 *    failure, NOT a lost race) so a route can't misreport an outage as a 409.
 * 4. releaseClaim sets status back to 'pending'.
 * 5. releaseClaim logs (does not throw) when its update returns an error.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { claimPending, releaseClaim } from "./idempotency";

// ---------------------------------------------------------------------------
// Mock Supabase query-builder chain
// ---------------------------------------------------------------------------

function makeMaybeSingleResult(data: unknown | null) {
  return {
    update: () => ({
      eq: (_col1: string, _val1: string) => ({
        eq: (_col2: string, _val2: string) => ({
          select: () => ({
            maybeSingle: async () => ({ data, error: null }),
          }),
        }),
      }),
    }),
  };
}

// Same chain shape, but the terminal maybeSingle resolves with a DB error and
// null data — the signature of a real failure (lock timeout, connection drop)
// rather than a zero-row race (which is data:null, error:null).
function makeMaybeSingleError(error: { message: string }) {
  return {
    update: () => ({
      eq: () => ({
        eq: () => ({
          select: () => ({
            maybeSingle: async () => ({ data: null, error }),
          }),
        }),
      }),
    }),
  };
}

function makeVoidResult(error: null | { message: string } = null) {
  return {
    update: () => ({
      eq: (_col1: string, _val1: string) => ({
        eq: (_col2: string, _val2: string) => Promise.resolve({ error }),
      }),
    }),
  };
}

describe("claimPending", () => {
  it("returns the updated row when the conditional update matches one row", async () => {
    const row = { id: "rr-1", status: "processing", amount: 50 };
    const db = {
      from: vi.fn(() => makeMaybeSingleResult(row)),
    } as unknown as Parameters<typeof claimPending>[0];

    const result = await claimPending(db, "refund_requests", "rr-1");

    expect(db.from).toHaveBeenCalledWith("refund_requests");
    expect(result).toEqual(row);
  });

  it("returns null when zero rows match (race loser / already claimed)", async () => {
    const db = {
      from: vi.fn(() => makeMaybeSingleResult(null)),
    } as unknown as Parameters<typeof claimPending>[0];

    const result = await claimPending(db, "refund_requests", "rr-1");

    expect(result).toBeNull();
  });

  it("throws when the underlying update returns an error (real DB failure, not a lost race)", async () => {
    const dbError = { message: "connection terminated unexpectedly" };
    const db = {
      from: vi.fn(() => makeMaybeSingleError(dbError)),
    } as unknown as Parameters<typeof claimPending>[0];

    await expect(claimPending(db, "refund_requests", "rr-1")).rejects.toBe(dbError);
  });
});

describe("releaseClaim", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls update with status=pending on the given table and id", async () => {
    const updateMock = vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      })),
    }));
    const db = {
      from: vi.fn(() => ({ update: updateMock })),
    } as unknown as Parameters<typeof releaseClaim>[0];

    await releaseClaim(db, "refund_requests", "rr-1");

    expect(db.from).toHaveBeenCalledWith("refund_requests");
    expect(updateMock).toHaveBeenCalledWith({ status: "pending" });
  });

  it("logs (and does not throw) when its update returns an error", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const dbError = { message: "rollback failed" };
    const db = {
      from: vi.fn(() => makeVoidResult(dbError)),
    } as unknown as Parameters<typeof releaseClaim>[0];

    await expect(
      releaseClaim(db, "refund_requests", "rr-1"),
    ).resolves.toBeUndefined();

    expect(errSpy).toHaveBeenCalledWith(
      "[idempotency] releaseClaim failed",
      expect.objectContaining({ table: "refund_requests", id: "rr-1", error: dbError }),
    );
  });
});
