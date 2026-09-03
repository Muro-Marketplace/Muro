// The first-touch welcome emails.
//
// Email audit, 2026-09-04, two findings, both here:
//
//   1. All three sends passed `category: "tips"` while all three templates
//      declare `recommendations`. The preference shown beside the template in
//      the library ("Recommendations") was therefore not the one the pipeline
//      honoured ("Tips"), the mail rode the news stream instead of notify, and
//      it was capped 2 per 168h rather than 3. Nobody could have found that by
//      reading either side alone.
//   2. The venue send passed `inviteTeamUrl`, a prop the template never
//      rendered, pointing at a portal page that does not exist.
//
// The rest of these pin the behaviour those changes had to preserve: the
// profile gate, the welcomed_at stamp, and the role split.

import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, getUserByIdMock, sendEmailMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getUserByIdMock: vi.fn(),
  sendEmailMock: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock, auth: { admin: { getUserById: getUserByIdMock } } }),
}));
vi.mock("@/lib/email/send", () => ({ sendEmail: sendEmailMock }));

import { triggerWelcomeIfNeeded } from "./welcome";

interface DbOpts {
  artistProfile?: Record<string, unknown> | null;
  venueProfile?: Record<string, unknown> | null;
  works?: Array<Record<string, unknown>>;
  artists?: Array<Record<string, unknown>>;
  workCount?: number;
}

/** Every `.update()` this run made, so the welcomed_at stamp is observable. */
let updates: Array<{ table: string; payload: Record<string, unknown> }> = [];

function installDb(opts: DbOpts = {}) {
  updates = [];
  fromMock.mockImplementation((table: string) => {
    const node: Record<string, unknown> = {};
    const self = () => node;
    for (const m of ["select", "eq", "in", "order", "limit", "not", "is", "gte"]) node[m] = self;
    node.maybeSingle = async () => ({
      data: table === "artist_profiles" ? opts.artistProfile ?? null : opts.venueProfile ?? null,
      error: null,
    });
    node.update = (payload: Record<string, unknown>) => {
      updates.push({ table, payload });
      return { eq: async () => ({ error: null }) };
    };
    node.then = (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) =>
      Promise.resolve(
        table === "artist_works"
          ? { data: opts.works ?? [], count: opts.workCount ?? 0, error: null }
          : { data: opts.artists ?? [], error: null },
      ).then(onOk, onErr);
    return node;
  });
}

function signedInAs(role: string | null) {
  getUserByIdMock.mockResolvedValue({
    data: {
      user: {
        id: "u-1",
        email: "someone@example.com",
        user_metadata: role ? { user_type: role, display_name: "Maya Chen" } : {},
      },
    },
    error: null,
  });
}

const sent = () => sendEmailMock.mock.calls.at(-1)?.[0];

beforeEach(() => {
  fromMock.mockReset();
  getUserByIdMock.mockReset();
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue({ ok: true, skipped: false, messageId: "m-1" });
  installDb();
});

describe("welcome emails send in the category their template declares", () => {
  it("sends the artist welcome as recommendations, not tips", async () => {
    signedInAs("artist");
    installDb({ artistProfile: { id: "ap-1", name: "Maya Chen", welcomed_at: null } });

    const outcome = await triggerWelcomeIfNeeded("u-1");

    expect(outcome).toEqual({ ok: true, sent: true });
    expect(sent().template).toBe("artist_welcome_checklist");
    // Fail-before: "tips".
    expect(sent().category).toBe("recommendations");
  });

  it("sends the venue welcome as recommendations, not tips", async () => {
    signedInAs("venue");
    installDb({ venueProfile: { id: "vp-1", name: "The Curzon", welcomed_at: null } });

    await triggerWelcomeIfNeeded("u-1");

    expect(sent().template).toBe("venue_welcome_checklist");
    expect(sent().category).toBe("recommendations");
  });

  it("sends the customer welcome as recommendations, not tips", async () => {
    signedInAs("customer");

    await triggerWelcomeIfNeeded("u-1");

    expect(sent().template).toBe("customer_welcome");
    expect(sent().category).toBe("recommendations");
  });

  it("matches what each template says about itself, so the preference shown is the one honoured", async () => {
    const { EMAIL_REGISTRY } = await import("@/emails/registry");
    const categoryOf = (id: string) => EMAIL_REGISTRY.find((t) => t.id === id)?.category;

    signedInAs("artist");
    installDb({ artistProfile: { id: "ap-1", name: "Maya Chen", welcomed_at: null } });
    await triggerWelcomeIfNeeded("u-1");
    expect(sent().category).toBe(categoryOf("artist_welcome_checklist"));

    signedInAs("venue");
    installDb({ venueProfile: { id: "vp-1", name: "The Curzon", welcomed_at: null } });
    await triggerWelcomeIfNeeded("u-1");
    expect(sent().category).toBe(categoryOf("venue_welcome_checklist"));

    signedInAs("customer");
    installDb();
    await triggerWelcomeIfNeeded("u-1");
    expect(sent().category).toBe(categoryOf("customer_welcome"));
  });
});

describe("welcome emails keep their existing guards", () => {
  it("stamps welcomed_at once the send has gone", async () => {
    signedInAs("venue");
    installDb({ venueProfile: { id: "vp-1", name: "The Curzon", welcomed_at: null } });

    await triggerWelcomeIfNeeded("u-1");

    expect(updates).toEqual([
      { table: "venue_profiles", payload: { welcomed_at: expect.any(String) } },
    ]);
  });

  it("does not send twice to a profile already welcomed", async () => {
    signedInAs("venue");
    installDb({ venueProfile: { id: "vp-1", name: "The Curzon", welcomed_at: "2026-09-01T00:00:00Z" } });

    const outcome = await triggerWelcomeIfNeeded("u-1");

    expect(outcome).toEqual({ ok: true, sent: false, reason: "already welcomed" });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("answers 'no profile yet' rather than sending when the row does not exist", async () => {
    // This is why the venue-profile route triggers the welcome itself: the
    // sign-in trigger reaches here before the row is created.
    signedInAs("venue");

    const outcome = await triggerWelcomeIfNeeded("u-1");

    expect(outcome).toEqual({ ok: true, sent: false, reason: "no profile yet" });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("does not stamp welcomed_at when the send was skipped", async () => {
    signedInAs("venue");
    installDb({ venueProfile: { id: "vp-1", name: "The Curzon", welcomed_at: null } });
    sendEmailMock.mockResolvedValue({ ok: true, skipped: true, reason: "opted_out" });

    const outcome = await triggerWelcomeIfNeeded("u-1");

    expect(outcome).toEqual({ ok: true, sent: false });
    expect(updates).toEqual([]);
  });

  it("sends nothing for an account with no role", async () => {
    signedInAs(null);

    const outcome = await triggerWelcomeIfNeeded("u-1");

    expect(outcome).toEqual({ ok: true, sent: false, reason: "no role" });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe("the venue welcome passes only props the template renders", () => {
  it("no longer passes inviteTeamUrl, which nothing rendered and which 404s", async () => {
    signedInAs("venue");
    installDb({ venueProfile: { id: "vp-1", name: "The Curzon", welcomed_at: null } });

    await triggerWelcomeIfNeeded("u-1");

    const html = await (await import("@react-email/components")).render(sent().react);
    expect(html).not.toContain("/venue-portal/team");
    expect(html).toContain("The Curzon");
  });
});
