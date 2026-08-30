// @vitest-environment jsdom
//
// G27. Flagged messages have been landing in moderation_queue since migration
// 116 (api/messages inserts entity_type:'message', and the moderation GET
// whitelist accepts it), but no page ever queried them, so the abuse queue
// filled where nobody looked. This unified queue is that page. These pin the
// two things that make it useful: messages are actually fetched and readable,
// and a decision reaches the endpoint that owns the row's type.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { authFetchMock, mutateMock } = vi.hoisted(() => ({
  authFetchMock: vi.fn(),
  mutateMock: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  authFetch: authFetchMock,
  mutate: mutateMock,
  ApiError: class ApiError extends Error {
    code?: string;
  },
}));
vi.mock("@/components/AdminPortalLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import ModerationAdminPage from "./page";

const MESSAGE_ROW = {
  id: "11111111-2222-4333-8444-555555555555",
  entity_type: "message",
  entity_id: "msg-1",
  submitted_by_user_id: "u-reporter",
  submitted_by_email: "reporter@example.com",
  status: "pending",
  decided_by_user_id: null,
  decided_at: null,
  reason: null,
  payload: {
    type: "message",
    message_id: "msg-1",
    conversation_id: "dm-abc",
    sender_slug: "some-artist",
    recipient_slug: "the-copper-kettle",
    flag_reason: "harassment",
    excerpt: "You will regret listing here.",
  },
  created_at: "2026-08-02T09:00:00.000Z",
};

const BLOG_ROW = {
  ...MESSAGE_ROW,
  id: "99999999-2222-4333-8444-555555555555",
  entity_type: "blog",
  entity_id: "blog-7",
  payload: { type: "blog", blog_id: "blog-7", title: "On framing", excerpt: "A short note." },
  created_at: "2026-08-01T09:00:00.000Z",
};

function reply(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body } as unknown as Response;
}

/** The All tab fans out one request per entity type, so the fixture answers
 *  per type the way the real endpoint does. */
function serve(rows: Array<Record<string, unknown>>) {
  authFetchMock.mockImplementation(async (url: string) => {
    const type = new URL(url, "http://localhost").searchParams.get("entity_type");
    return reply({ rows: rows.filter((r) => r.entity_type === type) });
  });
}

/** Rows are collapsed summaries; the body and the actions live inside. */
async function openRow(title: RegExp) {
  const row = await screen.findByText(title);
  fireEvent.click(row.closest("button")!);
}

beforeEach(() => {
  authFetchMock.mockReset();
  mutateMock.mockReset();
  serve([]);
  mutateMock.mockResolvedValue({ ok: true });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("G27: flagged messages are finally visible", () => {
  it("asks the API for message rows at all", async () => {
    render(<ModerationAdminPage />);
    await waitFor(() => expect(authFetchMock).toHaveBeenCalled());
    const urls = authFetchMock.mock.calls.map((c) => String(c[0]));
    // Fail-before: no page queried entity_type=message, so flagged abuse
    // accumulated unseen no matter how long it sat there.
    expect(urls.some((u) => u.includes("entity_type=message"))).toBe(true);
  });

  it("shows who sent it, why it was flagged, and what it said", async () => {
    serve([MESSAGE_ROW]);
    render(<ModerationAdminPage />);
    await openRow(/Flagged message from some-artist/i);
    // Twice over: the collapsed summary line and the detail panel.
    expect(screen.getAllByText(/harassment/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/You will regret listing here\./i)).toBeTruthy();
  });
});

describe("G27: a decision reaches the endpoint that owns the row", () => {
  it("a flagged message is decided on the moderation endpoint", async () => {
    serve([MESSAGE_ROW]);
    render(<ModerationAdminPage />);
    await openRow(/Flagged message from some-artist/i);

    fireEvent.click(screen.getByRole("button", { name: /approve/i }));
    await waitFor(() => expect(mutateMock).toHaveBeenCalled());
    const [url, init] = mutateMock.mock.calls[0] as [string, { method: string; body: string }];
    expect(url).toBe("/api/admin/moderation");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toMatchObject({ id: MESSAGE_ROW.id, action: "approve" });
  });

  it("a blog goes to the blogs endpoint instead, because approving one publishes it", async () => {
    serve([BLOG_ROW]);
    render(<ModerationAdminPage />);
    await openRow(/On framing/i);

    fireEvent.click(screen.getByRole("button", { name: /approve/i }));
    await waitFor(() => expect(mutateMock).toHaveBeenCalled());
    expect(String(mutateMock.mock.calls[0][0])).toBe("/api/admin/blogs/blog-7");
  });

  it("only the blog reject prompt says the reason is emailed, because only it is", async () => {
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("Not suitable.");
    serve([BLOG_ROW]);
    const { unmount } = render(<ModerationAdminPage />);
    await openRow(/On framing/i);
    fireEvent.click(screen.getByRole("button", { name: /reject/i }));
    await waitFor(() => expect(promptSpy).toHaveBeenCalled());
    expect(String(promptSpy.mock.calls[0][0])).toMatch(/emailed to the author/i);

    unmount();
    promptSpy.mockClear();
    serve([MESSAGE_ROW]);
    render(<ModerationAdminPage />);
    await openRow(/Flagged message from some-artist/i);
    fireEvent.click(screen.getByRole("button", { name: /reject/i }));
    await waitFor(() => expect(promptSpy).toHaveBeenCalled());
    expect(String(promptSpy.mock.calls[0][0])).not.toMatch(/emailed/i);
  });
});

describe("G27: the queue does not lie when it cannot load", () => {
  it("surfaces a failed load instead of rendering an empty queue", async () => {
    authFetchMock.mockResolvedValue(reply({ error: "moderation_unavailable" }, false));
    render(<ModerationAdminPage />);
    await waitFor(() => expect(screen.getByText(/moderation_unavailable/i)).toBeTruthy());
  });
});
