// @vitest-environment jsdom
// 05 bug-12 (part 1). The blog editor's save handlers used authFetch (resolves on
// a non-2xx) with a manual res.ok check. They now go through mutate() (throws on a
// non-2xx, ApiError carries the parsed body as .payload), so a rejected save shows
// the server's error via describeSaveError and never reports "Saved".

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

const { authFetchMock, mutateMock, routerReplaceMock } = vi.hoisted(() => ({
  authFetchMock: vi.fn(),
  mutateMock: vi.fn(),
  routerReplaceMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ supabase: { auth: {}, from: () => ({}) } }));
vi.mock("@/lib/api-client", async (orig) => {
  const actual = await orig<typeof import("@/lib/api-client")>();
  return { ...actual, authFetch: authFetchMock, mutate: mutateMock };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: routerReplaceMock, push: vi.fn() }) }));

import BlogEditor from "./BlogEditor";
import { ApiError } from "@/lib/api-client";

afterEach(() => cleanup());
beforeEach(() => {
  authFetchMock.mockReset();
  mutateMock.mockReset();
  routerReplaceMock.mockReset();
  // The mount effect loads artist works (a read GET); keep it happy.
  authFetchMock.mockResolvedValue(new Response(JSON.stringify({ works: [] }), { status: 200 }));
});

function renderAndFill() {
  render(<BlogEditor />);
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "My Post" } });
  fireEvent.change(screen.getByLabelText(/Body/), { target: { value: "Some body text" } });
}

describe("BlogEditor save (05 bug-12)", () => {
  it("surfaces the server error and does not report Saved when the create fails", async () => {
    mutateMock.mockRejectedValue(new ApiError(400, "bad", "bad_request", { error: "Title already taken" }));
    renderAndFill();

    fireEvent.click(screen.getByText("Save as draft"));

    // Fail-before: authFetch resolved on the non-2xx; the manual res.ok path is gone.
    expect(await screen.findByText("Title already taken")).toBeTruthy();
    expect(screen.getByText("Save failed")).toBeTruthy();
    expect(screen.queryByText("Saved")).toBeNull();
  });

  it("reports Saved and redirects on a confirmed create", async () => {
    mutateMock.mockResolvedValue({ blog: { id: "b1" } });
    renderAndFill();

    fireEvent.click(screen.getByText("Save as draft"));

    await waitFor(() => expect(routerReplaceMock).toHaveBeenCalledWith("/artist-portal/blogs/b1/edit"));
    expect(mutateMock).toHaveBeenCalledWith("/api/blogs", expect.objectContaining({ method: "POST" }));
    expect(screen.getByText("Saved")).toBeTruthy();
  });
});
