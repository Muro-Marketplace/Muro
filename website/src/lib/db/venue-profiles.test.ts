// 05 E42-c. upsertVenueProfile used to strip images + the display_* columns before
// writing: unconditionally on insert (so a new venue could never save photos) and on
// any update error via a retry that also returned success (silent data-loss). Those
// columns exist in prod (migrations 022/028), so the strip is pure loss. Now the data
// is written as-is and a real error surfaces.

import { describe, expect, it, vi, beforeEach } from "vitest";

const { insertMock, updateMock, existingRef } = vi.hoisted(() => ({
  insertMock: vi.fn(),
  updateMock: vi.fn(),
  existingRef: { data: null as unknown },
}));

vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: existingRef.data }) }) }),
      insert: insertMock,
      update: updateMock,
    }),
  }),
}));

import { upsertVenueProfile } from "./venue-profiles";

type UpsertData = Parameters<typeof upsertVenueProfile>[1];

beforeEach(() => {
  insertMock.mockReset();
  insertMock.mockResolvedValue({ error: null });
  updateMock.mockReset();
  existingRef.data = null;
});

describe("upsertVenueProfile (E42-c)", () => {
  it("insert branch keeps images + display_* instead of stripping them", async () => {
    existingRef.data = null; // no existing row -> insert branch
    await upsertVenueProfile(
      "u1",
      { images: ["a.jpg"], display_wall_space: "3 walls" } as UpsertData,
    );
    // Fail-before: the insert branch stripped these unconditionally.
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ images: ["a.jpg"], display_wall_space: "3 walls", user_id: "u1" }),
    );
  });

  it("update branch surfaces the error instead of stripping + retrying to a false success", async () => {
    existingRef.data = { id: "v1" }; // existing row -> update branch
    // Model the defect: the first update fails; the old code stripped the columns and
    // retried to a false success.
    updateMock
      .mockReturnValueOnce({ eq: async () => ({ error: { message: "boom" } }) })
      .mockReturnValue({ eq: async () => ({ error: null }) });

    const res = await upsertVenueProfile("u1", { images: ["a.jpg"] } as UpsertData);

    // Fail-before: old code retried (2nd update) and returned { error: null }.
    expect(res.error).toBeTruthy();
    expect(updateMock).toHaveBeenCalledTimes(1);
  });
});
