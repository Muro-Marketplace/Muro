// @vitest-environment jsdom
//
// G8. The page was a bare table of name, medium, location and join date, with a
// link to the public profile. It did not show review_status, which is the
// column deciding whether the artist appears on the marketplace at all, and it
// had no control that wrote anything.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

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

import AdminArtistsPage from "./page";

function artist(over: Record<string, unknown> = {}) {
  return {
    id: "ap-1",
    user_id: "u-artist",
    slug: "maya-chen",
    name: "Maya Chen",
    primary_medium: "Oil",
    location: "London",
    review_status: "approved",
    approved_at: "2026-05-01T09:00:00.000Z",
    created_at: "2026-04-01T09:00:00.000Z",
    ...over,
  };
}

function reply(artists: unknown[]) {
  return { ok: true, status: 200, json: async () => ({ artists }) } as unknown as Response;
}

beforeEach(() => {
  authFetchMock.mockReset();
  mutateMock.mockReset();
  authFetchMock.mockResolvedValue(reply([artist()]));
  mutateMock.mockResolvedValue({ review_status: "rejected" });
  vi.spyOn(window, "confirm").mockReturnValue(true);
  vi.spyOn(window, "prompt").mockReturnValue("Passing off another artist's work.");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("G8: the list shows whether a profile is live", () => {
  it("renders the review status for each artist", async () => {
    authFetchMock.mockResolvedValue(reply([artist(), artist({ id: "ap-2", name: "Sam Reed", slug: "sam-reed", review_status: "pending" })]));
    render(<AdminArtistsPage />);
    await screen.findByText("Maya Chen");

    // Scoped to the table: the filter tabs carry the same labels.
    const table = within(screen.getByRole("table"));
    expect(table.getByText("Live")).toBeTruthy();
    expect(table.getByText("Awaiting review")).toBeTruthy();
  });

  it("filters down to one status", async () => {
    authFetchMock.mockResolvedValue(reply([artist(), artist({ id: "ap-2", name: "Sam Reed", slug: "sam-reed", review_status: "pending" })]));
    render(<AdminArtistsPage />);
    await screen.findByText("Maya Chen");

    fireEvent.click(screen.getByRole("tab", { name: /awaiting review/i }));
    expect(screen.getByText("Sam Reed")).toBeTruthy();
    expect(screen.queryByText("Maya Chen")).toBeNull();
  });
});

describe("G8: taking a profile off the marketplace", () => {
  it("PATCHes the review status with the typed reason", async () => {
    render(<AdminArtistsPage />);
    fireEvent.click(await screen.findByText("Unpublish"));

    await waitFor(() => expect(mutateMock).toHaveBeenCalledTimes(1));
    const [url, init] = mutateMock.mock.calls[0];
    expect(url).toBe("/api/admin/artists");
    expect(init).toMatchObject({ method: "PATCH" });
    expect(JSON.parse((init as { body: string }).body)).toEqual({
      id: "ap-1",
      reviewStatus: "rejected",
      reason: "Passing off another artist's work.",
    });
  });

  it("confirms first, because it hides a working artist from the marketplace", async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    render(<AdminArtistsPage />);
    fireEvent.click(await screen.findByText("Unpublish"));
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("abandons the action when no reason is given", async () => {
    vi.mocked(window.prompt).mockReturnValue(null);
    render(<AdminArtistsPage />);
    fireEvent.click(await screen.findByText("Unpublish"));
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("reloads so the row moves to its new tab", async () => {
    render(<AdminArtistsPage />);
    fireEvent.click(await screen.findByText("Unpublish"));
    await waitFor(() => expect(authFetchMock).toHaveBeenCalledTimes(2));
  });
});

describe("G8: putting one back", () => {
  it("offers Restore on a rejected profile and not Unpublish", async () => {
    authFetchMock.mockResolvedValue(reply([artist({ review_status: "rejected" })]));
    render(<AdminArtistsPage />);

    expect(await screen.findByText("Restore")).toBeTruthy();
    expect(screen.queryByText("Unpublish")).toBeNull();
  });

  it("sends approved with no reason", async () => {
    authFetchMock.mockResolvedValue(reply([artist({ review_status: "rejected" })]));
    render(<AdminArtistsPage />);
    fireEvent.click(await screen.findByText("Restore"));

    await waitFor(() => expect(mutateMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse((mutateMock.mock.calls[0][1] as { body: string }).body)).toEqual({
      id: "ap-1",
      reviewStatus: "approved",
    });
  });

  it("offers Approve on a profile still at the gate", async () => {
    authFetchMock.mockResolvedValue(reply([artist({ review_status: "pending" })]));
    render(<AdminArtistsPage />);
    fireEvent.click(await screen.findByText("Approve"));

    await waitFor(() => expect(mutateMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse((mutateMock.mock.calls[0][1] as { body: string }).body).reviewStatus).toBe(
      "approved",
    );
  });
});
