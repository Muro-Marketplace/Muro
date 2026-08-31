// G13 + G14 + G15. Three defects on the blog moderation path:
//
//   G13  An admin approved a post having seen a 200-character excerpt and
//        nothing else. There was no way to read the body before publishing it,
//        because the route had no GET and the public /api/blogs/[id] is
//        owner-only for anything unpublished.
//   G14  The reject prompt promises the reason is "visible to the author".
//        It was written to moderation_queue.reason and nothing read it back.
//   G15  Neither decision notified the author at all. They found out by
//        revisiting their own list, unlike the applications gate which emails
//        both ways.
//
// Same shape as the moderation route tests: the real getAdminUser runs against
// a mocked Supabase, so these exercise the actual admin predicate.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@react-email/components";

const { getUser, getUserById, fromMock, recordMock, sendEmailMock, updateMock } = vi.hoisted(() => ({
  getUser: vi.fn(),
  getUserById: vi.fn(),
  fromMock: vi.fn(),
  recordMock: vi.fn(),
  sendEmailMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    auth: { getUser, admin: { getUserById } },
    from: fromMock,
  }),
}));
vi.mock("@/lib/admin-audit", () => ({ recordAdminAction: recordMock }));
vi.mock("@/lib/email/send", () => ({ sendEmail: sendEmailMock }));

import { GET, PATCH } from "./route";

const BLOG = {
  id: "blog-1",
  author_user_id: "u-author",
  status: "pending_review",
  title: "Painting for small rooms",
  slug: "painting-for-small-rooms",
  body_markdown: "The whole body of the post, well past two hundred characters.",
  cover_image_url: null,
  published_at: null,
  created_at: "2026-08-01T09:00:00.000Z",
  updated_at: "2026-08-01T09:00:00.000Z",
};

function adminUsersChain() {
  return {
    select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }),
  };
}

function blogsTable(row: unknown = BLOG) {
  return {
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
    update: (payload: Record<string, unknown>) => ({
      eq: async () => updateMock("blogs", payload),
    }),
  };
}

function queueTable() {
  return {
    update: (payload: Record<string, unknown>) => ({
      eq: () => ({ eq: async () => updateMock("moderation_queue", payload) }),
    }),
  };
}

function req(method: string, body?: unknown, token: string | null = "Bearer x"): Request {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = token;
  return new Request("http://localhost/api/admin/blogs/blog-1", {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const params = { params: Promise.resolve({ id: "blog-1" }) };

beforeEach(() => {
  getUser.mockReset();
  getUserById.mockReset();
  fromMock.mockReset();
  recordMock.mockReset();
  sendEmailMock.mockReset();
  updateMock.mockReset();

  process.env.ADMIN_EMAILS = "boss@example.com";
  process.env.NEXT_PUBLIC_SITE_URL = "https://wallplace.co.uk";
  updateMock.mockResolvedValue({ error: null });
  sendEmailMock.mockResolvedValue({ ok: true, skipped: false, messageId: "m1" });
  fromMock.mockImplementation((table: string) => {
    if (table === "admin_users") return adminUsersChain();
    if (table === "moderation_queue") return queueTable();
    return blogsTable();
  });
  getUser.mockResolvedValue({
    data: {
      user: { id: "u-admin", email: "boss@example.com", user_metadata: { user_type: "admin" } },
    },
    error: null,
  });
  getUserById.mockResolvedValue({
    data: { user: { id: "u-author", email: "maya@example.com", user_metadata: { display_name: "Maya Chen" } } },
    error: null,
  });
});

describe("G13: GET returns the whole post so approval is not blind", () => {
  it("returns the body, not just the queue excerpt", async () => {
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.blog.body_markdown).toBe(BLOG.body_markdown);
    expect(body.blog.title).toBe(BLOG.title);
  });

  it("404s on a blog that does not exist", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "admin_users") return adminUsersChain();
      return blogsTable(null);
    });
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(404);
  });

  it("never runs for a non-admin", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "nobody@example.com", user_metadata: {} } },
      error: null,
    });
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(403);
  });
});

describe("G15: approving tells the author", () => {
  it("emails the author that the post is live", async () => {
    const res = await PATCH(req("PATCH", { action: "approve" }), params);
    expect(res.status).toBe(200);

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const sent = sendEmailMock.mock.calls[0][0];
    expect(sent.template).toBe("artist_blog_published");
    expect(sent.to).toBe("maya@example.com");
    expect(sent.userId).toBe("u-author");
    expect(sent.idempotencyKey).toBe("blog_published:blog-1");
  });

  it("still publishes when the author has no reachable address", async () => {
    getUserById.mockResolvedValue({ data: { user: null }, error: null });
    const res = await PATCH(req("PATCH", { action: "approve" }), params);
    expect(res.status).toBe(200);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(
      updateMock.mock.calls.some(([t, p]) => t === "blogs" && p.status === "published"),
    ).toBe(true);
  });
});

describe("G14 + G15: rejecting carries the reason to the author", () => {
  it("emails the author with the moderator's reason", async () => {
    const res = await PATCH(
      req("PATCH", { action: "reject", reason: "It names a venue we have not placed with." }),
      params,
    );
    expect(res.status).toBe(200);

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const sent = sendEmailMock.mock.calls[0][0];
    expect(sent.template).toBe("artist_blog_rejected");
    expect(sent.to).toBe("maya@example.com");

    // The reason has to survive all the way into the rendered body: that is
    // the whole of G14. Asserting on the element's props would only prove the
    // route built one.
    const html = await render(sent.react);
    expect(html).toContain("It names a venue we have not placed with.");
    expect(html).toContain(BLOG.title);
  });

  it("keeps writing the reason onto the queue row", async () => {
    await PATCH(req("PATCH", { action: "reject", reason: "Needs an edit." }), params);
    const queueWrite = updateMock.mock.calls.find(([t]) => t === "moderation_queue");
    expect(queueWrite?.[1]).toMatchObject({ status: "rejected", reason: "Needs an edit." });
  });
});

describe("editing sends nothing", () => {
  it("an admin edit is not a decision, so the author gets no email", async () => {
    const res = await PATCH(req("PATCH", { action: "edit", title: "A better title" }), params);
    expect(res.status).toBe(200);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
