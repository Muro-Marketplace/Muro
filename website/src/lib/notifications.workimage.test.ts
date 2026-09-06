/**
 * A bell about a specific piece carries that piece's image, so the drawer can
 * show the work instead of a generic kind icon. The icon said what happened,
 * which the title already said; nothing said WHICH work it happened to.
 *
 * The image is stored rather than a work id, matching placements.work_image:
 * the drawer renders without a join, and an old bell keeps showing the picture
 * the work had at the time rather than silently changing after a re-upload.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { adminMock, insertMock } = vi.hoisted(() => ({ adminMock: vi.fn(), insertMock: vi.fn() }));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: adminMock }));

import { createNotification } from "./notifications";

const row = () => insertMock.mock.calls[0][0];

beforeEach(() => {
  vi.clearAllMocks();
  insertMock.mockResolvedValue({ error: null });
  adminMock.mockReturnValue({ from: () => ({ insert: insertMock }) });
});

describe("createNotification work image", () => {
  it("stores the image when the bell is about a piece", async () => {
    await createNotification({
      userId: "u1", kind: "placement_accepted", title: "Placement accepted",
      workImage: "https://cdn.example/harbour.jpg",
    });
    expect(row().work_image).toBe("https://cdn.example/harbour.jpg");
  });

  it("stores null for the notifications that are not about one, which is most", async () => {
    await createNotification({ userId: "u1", kind: "payout_sent", title: "Payout sent" });
    expect(row().work_image).toBeNull();
  });

  it("treats blank and whitespace as no image, so the drawer falls back to the kind icon", async () => {
    for (const workImage of ["", "   ", null]) {
      insertMock.mockClear();
      await createNotification({ userId: "u1", kind: "k", title: "t", workImage });
      expect(row().work_image).toBeNull();
    }
  });

  it("still refuses to insert without a user id", async () => {
    await createNotification({ userId: "", kind: "k", title: "t", workImage: "x.jpg" });
    expect(insertMock).not.toHaveBeenCalled();
  });
});
