// 09 §D.3 / item 3.5. The other half of double opt-in.
//
// Without this route the confirm link 404s, nobody is ever confirmed, nobody
// ever receives a newsletter, and the signup form looks like it worked. §D.3 is
// blunt about it: "Without this route the confirm link 404s and double opt-in is
// worse than none."

import { describe, it, expect, vi, beforeEach } from "vitest";

const { fromMock, findUserIdMock, upsertMock, updateMock, maybeSingleMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  findUserIdMock: vi.fn(),
  upsertMock: vi.fn(),
  updateMock: vi.fn() as unknown as ReturnType<typeof vi.fn> & { lastRow: Record<string, unknown> },
  maybeSingleMock: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock, auth: { admin: {} } }),
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/auth/find-user-by-email", () => ({ findUserIdByEmail: findUserIdMock }));

import { GET } from "./route";
import { checkRateLimit } from "@/lib/rate-limit";

const TOKEN = "6f1a9c2e-4b7d-4a10-9f33-2c8e5b1d7a04";

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

const ROW = {
  id: "sub-1",
  email: "sam@example.com",
  subscribed_at: daysAgo(1),
  confirmed_at: null,
};

function installDb(opts: { row?: unknown; lookupError?: unknown; updateError?: unknown } = {}) {
  maybeSingleMock.mockResolvedValue({
    data: "row" in opts ? opts.row : ROW,
    error: opts.lookupError ?? null,
  });
  updateMock.mockImplementation((row: Record<string, unknown>) => {
    updateMock.lastRow = row;
    return { eq: async () => ({ error: opts.updateError ?? null }) };
  });
  fromMock.mockImplementation((table: string) => {
    if (table === "newsletter_subscribers") {
      return {
        select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }),
        update: updateMock,
      };
    }
    return { upsert: upsertMock };
  });
}

function req(t?: string): Request {
  const url = t === undefined
    ? "http://localhost/api/newsletter/confirm"
    : `http://localhost/api/newsletter/confirm?t=${encodeURIComponent(t)}`;
  return new Request(url);
}

/** The landing page status the redirect carries. */
function statusOf(res: Response): string | null {
  const loc = res.headers.get("location");
  return loc ? new URL(loc).searchParams.get("status") : null;
}

beforeEach(() => {
  fromMock.mockReset();
  updateMock.mockReset();
  upsertMock.mockReset();
  maybeSingleMock.mockReset();
  findUserIdMock.mockReset();
  findUserIdMock.mockResolvedValue(null);
  upsertMock.mockResolvedValue({ error: null });
  vi.mocked(checkRateLimit).mockResolvedValue(null);
  vi.spyOn(console, "error").mockImplementation(() => {});
  installDb();
});

describe("GET /api/newsletter/confirm", () => {
  it("confirms the subscriber and lands them on the success page", async () => {
    const res = await GET(req(TOKEN));

    expect(res.status).toBe(303);
    expect(statusOf(res)).toBe("ok");
    expect(updateMock.lastRow.confirmed_at).toEqual(expect.any(String));
  });

  it("CLEARS the token, so the link is single-use", async () => {
    // A kept token is a standing capability sitting in a mailbox archive, a
    // forwarded email, and any proxy log that recorded the URL.
    await GET(req(TOKEN));
    expect(updateMock.lastRow.confirm_token).toBeNull();
  });

  it("looks the row up BY the token, not by anything the caller can pick", async () => {
    await GET(req(TOKEN));
    expect(maybeSingleMock).toHaveBeenCalled();
  });

  it("reverses an earlier unsubscribe, because confirming is an unambiguous yes", async () => {
    await GET(req(TOKEN));
    expect(updateMock.lastRow.unsubscribed_at).toBeNull();
  });

  it("turns on newsletter_enabled when the address belongs to an account", async () => {
    // Without this the subscriber is confirmed in one table and opted out in
    // the other, and sendEmail drops every newsletter: newsletter_enabled
    // defaults to FALSE precisely because double opt-in was meant to set it.
    findUserIdMock.mockResolvedValue("u-1");

    await GET(req(TOKEN));

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "u-1", newsletter_enabled: true }),
      { onConflict: "user_id" },
    );
  });

  it("confirms an address with no account without touching preferences", async () => {
    findUserIdMock.mockResolvedValue(null);

    const res = await GET(req(TOKEN));

    expect(statusOf(res)).toBe("ok");
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("still reports success when the preference upsert fails", async () => {
    // The subscription is confirmed. Showing an error page for a preference row
    // would tell someone their click failed when it did not.
    findUserIdMock.mockResolvedValue("u-1");
    upsertMock.mockRejectedValue(new Error("boom"));

    expect(statusOf(await GET(req(TOKEN)))).toBe("ok");
  });
});

describe("GET /api/newsletter/confirm refuses what it should", () => {
  it("rejects a missing token without querying anything", async () => {
    const res = await GET(req());
    expect(statusOf(res)).toBe("invalid");
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rejects a token that is not even a uuid, before the database", async () => {
    const res = await GET(req("' OR 1=1 --"));
    expect(statusOf(res)).toBe("invalid");
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown token", async () => {
    installDb({ row: null });
    const res = await GET(req(TOKEN));
    expect(statusOf(res)).toBe("invalid");
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("treats an already-used token exactly like an unknown one", async () => {
    // The token is cleared on use, so a second click finds no row. Saying
    // "already confirmed" would answer whether an address is subscribed.
    installDb({ row: null });
    const used = await GET(req(TOKEN));

    installDb({ row: null });
    const unknown = await GET(req("11111111-2222-4333-8444-555555555555"));

    expect(statusOf(used)).toBe(statusOf(unknown));
    expect(used.headers.get("location")).toBe(unknown.headers.get("location"));
  });

  it("refuses a token older than the 7 days the email promises", async () => {
    // The email says the link works for 7 days. An expiry that is claimed and
    // not enforced is just a false statement to the reader.
    installDb({ row: { ...ROW, subscribed_at: daysAgo(8) } });

    const res = await GET(req(TOKEN));

    expect(statusOf(res)).toBe("expired");
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("still accepts a token on the last day", async () => {
    installDb({ row: { ...ROW, subscribed_at: daysAgo(6.9) } });
    expect(statusOf(await GET(req(TOKEN)))).toBe("ok");
  });

  it("reports a failed update as a failure rather than claiming success", async () => {
    installDb({ updateError: { message: "conflict" } });
    expect(statusOf(await GET(req(TOKEN)))).toBe("invalid");
  });

  it("reports a failed lookup as a failure", async () => {
    installDb({ row: null, lookupError: { message: "down" } });
    expect(statusOf(await GET(req(TOKEN)))).toBe("invalid");
  });

  it("honours the rate limit before doing anything", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue(new Response(null, { status: 429 }) as never);

    const res = await GET(req(TOKEN));

    expect(res.status).toBe(429);
    expect(fromMock).not.toHaveBeenCalled();
  });
});
