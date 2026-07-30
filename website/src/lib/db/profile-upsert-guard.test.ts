// A5/A7 wiring, not just the helper.
//
// writable-fields.test.ts covers assertNoServerOwned in isolation. That is what
// E23a taught: a control with full unit coverage and no call site passes every
// test and protects nothing. So this file proves the guard actually fires from
// inside upsertArtistProfile and upsertVenueProfile, which is where it has to be
// for a future caller to be unable to skip it.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { updateSpy, insertSpy } = vi.hoisted(() => ({
  updateSpy: vi.fn(),
  insertSpy: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

/** Row exists by default, so the UPDATE branch is the one under test. */
let rowExists = true;

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: rowExists ? { id: "existing" } : null }) }),
      }),
      update: (payload: Record<string, unknown>) => {
        updateSpy(payload);
        return { eq: async () => ({ error: null }) };
      },
      insert: async (payload: Record<string, unknown>) => {
        insertSpy(payload);
        return { error: null };
      },
    }),
  }),
}));

import { upsertArtistProfile } from "./artist-profiles";
import { upsertVenueProfile } from "./venue-profiles";

beforeEach(() => {
  rowExists = true;
  updateSpy.mockClear();
  insertSpy.mockClear();
});

describe("upsertArtistProfile enforces the server-owned guard (A5)", () => {
  it("refuses a client-supplied subscription_plan and never reaches the DB", async () => {
    // E44's payload: self-grant Pro.
    await expect(
      upsertArtistProfile("u1", { subscription_plan: "pro" } as never),
    ).rejects.toThrow(/subscription_plan/);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("refuses a self-approval", async () => {
    await expect(
      upsertArtistProfile("u1", { review_status: "approved" } as never),
    ).rejects.toThrow(/review_status/);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("refuses a redirected payout destination", async () => {
    await expect(
      upsertArtistProfile("u1", { stripe_connect_account_id: "acct_attacker" } as never),
    ).rejects.toThrow(/stripe_connect_account_id/);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("permits the server-derived lat/lng the artist PUT legitimately sets", async () => {
    await expect(
      upsertArtistProfile("u1", { lat: 51.5, lng: -0.12 } as never, {
        allowServerOwned: ["lat", "lng"],
      }),
    ).resolves.toBeTruthy();
    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  it("does not let an entitlement smuggle a second column through", async () => {
    // Being allowed to set lat must not also permit subscription_plan on the
    // same call. This is the property that makes the exemption safe.
    await expect(
      upsertArtistProfile("u1", { lat: 51.5, subscription_plan: "pro" } as never, {
        allowServerOwned: ["lat"],
      }),
    ).rejects.toThrow(/subscription_plan/);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("permits the creation path's slug and initial review_status", async () => {
    rowExists = false;
    await expect(
      upsertArtistProfile("u1", { slug: "maya-chen", review_status: "pending" } as never, {
        allowServerOwned: ["slug", "review_status"],
      }),
    ).resolves.toBeTruthy();
    expect(insertSpy).toHaveBeenCalledTimes(1);
  });

  it("still passes an ordinary profile edit", async () => {
    await expect(upsertArtistProfile("u1", { name: "Maya" })).resolves.toBeTruthy();
    expect(updateSpy).toHaveBeenCalledTimes(1);
  });
});

describe("upsertVenueProfile enforces the server-owned guard (A7)", () => {
  it("refuses a slug squat", async () => {
    await expect(
      upsertVenueProfile("u1", { slug: "someone-elses-venue" } as never),
    ).rejects.toThrow(/slug/);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("refuses a user_id write, which would hand the row to another account", async () => {
    // E45's worst case: user_id lands in SET while the WHERE still matches the
    // caller, so the row changes owner.
    await expect(
      upsertVenueProfile("u1", { user_id: "someone-else" } as never),
    ).rejects.toThrow(/user_id/);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("refuses a self-granted subscription", async () => {
    await expect(
      upsertVenueProfile("u1", { subscription_plan: "pro" } as never),
    ).rejects.toThrow(/subscription_plan/);
  });

  it("permits the creation path's slug", async () => {
    rowExists = false;
    await expect(
      upsertVenueProfile("u1", { slug: "the-kettle", name: "The Kettle" } as never, {
        allowServerOwned: ["slug"],
      }),
    ).resolves.toBeTruthy();
    expect(insertSpy).toHaveBeenCalledTimes(1);
  });

  it("still passes an ordinary venue edit", async () => {
    await expect(upsertVenueProfile("u1", { name: "The Kettle" })).resolves.toBeTruthy();
    expect(updateSpy).toHaveBeenCalledTimes(1);
  });
});
