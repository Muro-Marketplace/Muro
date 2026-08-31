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

// Row 2442 area / PASS2 "silent failure" pattern. On /artist-portal/blogs/new,
// "Submit for review" saved the draft (POST 200) and then failed the review
// PATCH with `422 {"error":"Not ready for review","issues":["Body needs at
// least 200 characters before submitting."]}`. The author saw none of it: the
// create had already called router.replace, so the editor holding the error was
// on its way off screen and a fresh one mounted showing a draft. Status stayed
// "draft" and the author believed they had submitted.
describe("BlogEditor submit-for-review refusal is visible (row 2442)", () => {
  const NOT_READY = new ApiError(422, "Not ready for review", "Not ready for review", {
    error: "Not ready for review",
    issues: ["Body needs at least 200 characters before submitting."],
  });

  it("shows the server's reason when the review PATCH is refused", async () => {
    mutateMock
      .mockResolvedValueOnce({ blog: { id: "b1" } }) // create succeeds
      .mockRejectedValueOnce(NOT_READY); // submit is refused
    renderAndFill();

    fireEvent.click(screen.getByText("Submit for review"));

    expect(
      await screen.findByText(/Body needs at least 200 characters before submitting\./),
    ).toBeTruthy();
  });

  it("does not navigate away from the refusal", async () => {
    mutateMock
      .mockResolvedValueOnce({ blog: { id: "b1" } })
      .mockRejectedValueOnce(NOT_READY);
    renderAndFill();

    fireEvent.click(screen.getByText("Submit for review"));
    await screen.findByText(/Body needs at least 200 characters/);

    expect(routerReplaceMock).not.toHaveBeenCalled();
  });

  it("still moves to the saved draft's URL once the submission is accepted", async () => {
    mutateMock
      .mockResolvedValueOnce({ blog: { id: "b1" } })
      .mockResolvedValueOnce({ blog: { id: "b1", status: "pending_review" } });
    renderAndFill();

    fireEvent.click(screen.getByText("Submit for review"));

    await waitFor(() =>
      expect(routerReplaceMock).toHaveBeenCalledWith("/artist-portal/blogs/b1/edit"),
    );
  });
});
