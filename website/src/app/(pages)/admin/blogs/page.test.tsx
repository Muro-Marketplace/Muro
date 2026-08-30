// @vitest-environment jsdom
//
// G13. The queue row showed a 200-character excerpt and an Approve button, and
// approving publishes the post to the public journal. There was no way to read
// the thing being published. The row now fetches the body from the admin
// blog-detail route and shows it above the decision controls.
//
// G14 is the sibling copy fix: the reject prompt's promise that the reason is
// "visible to the author" is now true, because the reject email carries it.

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

import AdminBlogsPage from "./page";

const QUEUE_ROW = {
  id: "q-1",
  entity_id: "blog-1",
  submitted_by_email: "maya@example.com",
  status: "pending",
  payload: {
    type: "blog",
    blog_id: "blog-1",
    title: "Painting for small rooms",
    excerpt: "A short excerpt that stops mid sen",
  },
  created_at: "2026-08-01T09:00:00.000Z",
};

const FULL_BODY =
  "The body of the post that the excerpt cuts off, which is the whole point of being able to read it before publishing it.";

function reply(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body } as unknown as Response;
}

beforeEach(() => {
  authFetchMock.mockReset();
  mutateMock.mockReset();
  mutateMock.mockResolvedValue({ status: "approved" });
  authFetchMock.mockImplementation(async (url: string) => {
    if (url.startsWith("/api/admin/blogs/")) {
      return reply({ blog: { id: "blog-1", title: QUEUE_ROW.payload.title, body_markdown: FULL_BODY } });
    }
    return reply({ rows: [QUEUE_ROW] });
  });
  vi.spyOn(window, "prompt").mockReturnValue("Needs an edit.");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("G13: the moderator can read the post before publishing it", () => {
  it("fetches the full post from the admin blog route on demand", async () => {
    render(<AdminBlogsPage />);
    fireEvent.click(await screen.findByText(/read the full post/i));

    await waitFor(() =>
      expect(authFetchMock).toHaveBeenCalledWith("/api/admin/blogs/blog-1"),
    );
    expect(await screen.findByText(new RegExp(FULL_BODY.slice(0, 40)))).toBeTruthy();
  });

  it("does not fetch every body up front, only the one asked for", async () => {
    render(<AdminBlogsPage />);
    await screen.findByText("Painting for small rooms");
    expect(
      authFetchMock.mock.calls.filter((c) => String(c[0]).startsWith("/api/admin/blogs/")),
    ).toHaveLength(0);
  });

  it("says so when the body cannot be loaded rather than showing an empty panel", async () => {
    authFetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/admin/blogs/")) return reply({ error: "boom" }, false);
      return reply({ rows: [QUEUE_ROW] });
    });
    render(<AdminBlogsPage />);
    fireEvent.click(await screen.findByText(/read the full post/i));
    expect(await screen.findByText(/could not load the post/i)).toBeTruthy();
  });
});

describe("G14: the reject prompt tells the truth about who sees the reason", () => {
  it("sends the reason to the decision route, which emails it to the author", async () => {
    render(<AdminBlogsPage />);
    fireEvent.click(await screen.findByText("Reject"));

    await waitFor(() => expect(mutateMock).toHaveBeenCalledTimes(1));
    const [url, init] = mutateMock.mock.calls[0];
    expect(url).toBe("/api/admin/blogs/blog-1");
    expect(JSON.parse((init as { body: string }).body)).toEqual({
      action: "reject",
      reason: "Needs an edit.",
    });
    expect(vi.mocked(window.prompt).mock.calls[0][0]).toMatch(/emailed to the author/i);
  });
});
