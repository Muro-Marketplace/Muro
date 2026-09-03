import { describe, it, expect, vi, beforeEach } from "vitest";

const maybeSingle = vi.fn();
const chain = {
  select: vi.fn(() => chain),
  eq: vi.fn(() => chain),
  order: vi.fn(() => chain),
  limit: vi.fn(() => chain),
  maybeSingle,
};
const from = vi.fn(() => chain);
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from }) }));

import { getAppliedPlanByEmail } from "./artist-applications";

describe("getAppliedPlanByEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the normalised plan from the latest application for that email", async () => {
    maybeSingle.mockResolvedValue({ data: { selected_plan: "Premium" }, error: null });
    expect(await getAppliedPlanByEmail("  Artist@Example.com ")).toBe("premium");
    expect(from).toHaveBeenCalledWith("artist_applications");
    expect(chain.eq).toHaveBeenCalledWith("email", "artist@example.com");
    expect(chain.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("is null for unknown plans, missing rows, errors and blank emails", async () => {
    maybeSingle.mockResolvedValue({ data: { selected_plan: "gold" }, error: null });
    expect(await getAppliedPlanByEmail("a@b.c")).toBeNull();
    maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await getAppliedPlanByEmail("a@b.c")).toBeNull();
    maybeSingle.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await getAppliedPlanByEmail("a@b.c")).toBeNull();
    expect(await getAppliedPlanByEmail("")).toBeNull();
    expect(from).toHaveBeenCalledTimes(3);
  });

  it("swallows a thrown client error", async () => {
    maybeSingle.mockRejectedValue(new Error("network"));
    expect(await getAppliedPlanByEmail("a@b.c")).toBeNull();
  });
});
