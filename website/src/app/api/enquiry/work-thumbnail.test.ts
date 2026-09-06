/**
 * An enquiry names a work, and until migration 137 it named it in text alone:
 * enquiries.work_title was a bare string with no key, so the artist's list said
 * "Re: Harbour Light" and they had to remember which piece that was.
 *
 * The id now arrives from the PUBLIC enquiry form, so what matters most here is
 * that it is verified against the artist it is addressed to. Without the
 * ownership check a visitor could attach any work id in the table and the
 * artist's own enquiries list would show a stranger's painting.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { adminMock, publicInsertMock } = vi.hoisted(() => ({
  adminMock: vi.fn(),
  publicInsertMock: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: adminMock }));
vi.mock("@/lib/supabase", () => ({
  supabase: { from: () => ({ insert: publicInsertMock }) },
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => null }));
vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: async () => ({ user: null, error: null }) }));
vi.mock("@/lib/email/admin-alert", () => ({ sendAdminAlert: vi.fn() }));
vi.mock("@/lib/email/notifications", () => ({ sendMessageUnreadEmail: vi.fn() }));
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn() }));

import { POST } from "./route";

const ARTIST = { id: "artist-1", slug: "fin-coles" };
const WORK = { id: "work-1", image: "https://cdn.example/harbour.jpg" };

/**
 * Admin client stub. `works` is what artist_works returns for the id AND
 * artist_id the route filters on, so passing null models both "no such work"
 * and "that work belongs to someone else".
 */
function stubAdmin({ works }: { works: { id: string; image: string | null } | null }) {
  adminMock.mockReturnValue({
    from: (table: string) => {
      if (table === "artist_profiles") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: ARTIST }) }) }) };
      }
      if (table === "artist_works") {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: works }) }) }) }),
        };
      }
      // Everything after the insert (messages, conversations, notifications).
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }), single: async () => ({ data: null }) }) }),
        insert: () => ({ select: () => ({ single: async () => ({ data: null }) }) }),
      };
    },
  });
}

function post(body: Record<string, unknown>) {
  return new Request("http://localhost/api/enquiry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      senderName: "A Buyer",
      senderEmail: "buyer@example.com",
      artistSlug: "fin-coles",
      enquiryType: "purchase",
      message: "Is this still available?",
      ...body,
    }),
  });
}

/** The row handed to enquiries.insert. */
const inserted = () => publicInsertMock.mock.calls[0][0];

beforeEach(() => {
  vi.clearAllMocks();
  publicInsertMock.mockResolvedValue({ error: null });
});

describe("POST /api/enquiry, the work it is about", () => {
  it("stores the work and its image when the id belongs to that artist", async () => {
    stubAdmin({ works: WORK });
    await POST(post({ workTitle: "Harbour Light", workId: "work-1" }));
    expect(inserted().work_id).toBe("work-1");
    expect(inserted().work_image).toBe("https://cdn.example/harbour.jpg");
  });

  it("refuses a work id belonging to a DIFFERENT artist, without losing the enquiry", async () => {
    // The route filters on artist_id, so another artist's work returns nothing.
    stubAdmin({ works: null });
    await POST(post({ workTitle: "Someone Else's Piece", workId: "work-999" }));
    expect(inserted().work_id).toBeNull();
    expect(inserted().work_image).toBeNull();
    // The message itself still lands: correspondence outranks its thumbnail.
    expect(inserted().message).toBe("Is this still available?");
  });

  it("stores nulls for a general enquiry that names no work", async () => {
    stubAdmin({ works: WORK });
    await POST(post({}));
    expect(inserted().work_id).toBeNull();
    expect(inserted().work_image).toBeNull();
  });

  it("treats a blank id as absent rather than looking it up", async () => {
    stubAdmin({ works: WORK });
    await POST(post({ workTitle: "Harbour Light", workId: "   " }));
    expect(inserted().work_id).toBeNull();
  });

  it("stores the work with no image as a work, not as nothing", async () => {
    stubAdmin({ works: { id: "work-1", image: null } });
    await POST(post({ workTitle: "Harbour Light", workId: "work-1" }));
    expect(inserted().work_id).toBe("work-1");
    expect(inserted().work_image).toBeNull();
  });
});
