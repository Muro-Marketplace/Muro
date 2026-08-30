// @vitest-environment jsdom
//
// G26. Same defect as G25 on the feedback inbox: no write path ever touched
// entity_type='feedback' rows, so the Approved and Rejected tabs could never
// populate and the inbox could not be cleared. /api/admin/moderation now has a
// PATCH; this page needed a control that calls it.

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

import FeedbackAdminPage from "./page";

const ROW = {
  id: "11111111-2222-4333-8444-555555555555",
  entity_id: "fb-1",
  submitted_by_email: "someone@example.com",
  status: "pending",
  payload: {
    type: "feedback",
    rating: 4,
    message: "The browse filters are great, the map is slow.",
    source_url: "/browse",
    contact_email: "someone@example.com",
    user_agent: null,
  },
  created_at: "2026-08-01T09:00:00.000Z",
};

function reply(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body } as unknown as Response;
}

beforeEach(() => {
  authFetchMock.mockReset();
  mutateMock.mockReset();
  authFetchMock.mockResolvedValue(reply({ rows: [ROW] }));
  mutateMock.mockResolvedValue({ status: "approved" });
  vi.spyOn(window, "prompt").mockReturnValue("Duplicate of an existing report.");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("G26: feedback can be cleared out of pending", () => {
  it("marks it read through PATCH /api/admin/moderation", async () => {
    render(<FeedbackAdminPage />);
    fireEvent.click(await screen.findByText("Approve"));

    await waitFor(() => expect(mutateMock).toHaveBeenCalledTimes(1));
    const [url, init] = mutateMock.mock.calls[0];
    expect(url).toBe("/api/admin/moderation");
    expect(JSON.parse((init as { body: string }).body)).toEqual({
      id: ROW.id,
      action: "approve",
    });
  });

  it("rejects with the typed reason", async () => {
    render(<FeedbackAdminPage />);
    fireEvent.click(await screen.findByText("Reject"));

    await waitFor(() => expect(mutateMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse((mutateMock.mock.calls[0][1] as { body: string }).body)).toEqual({
      id: ROW.id,
      action: "reject",
      reason: "Duplicate of an existing report.",
    });
  });

  it("reloads so the row leaves the pending tab", async () => {
    render(<FeedbackAdminPage />);
    fireEvent.click(await screen.findByText("Approve"));
    await waitFor(() => expect(authFetchMock).toHaveBeenCalledTimes(2));
  });

  it("offers no decision controls on an already-decided row", async () => {
    authFetchMock.mockResolvedValue(reply({ rows: [{ ...ROW, status: "rejected" }] }));
    render(<FeedbackAdminPage />);
    fireEvent.click(await screen.findByText("rejected"));
    await screen.findByText("The browse filters are great, the map is slow.");
    expect(screen.queryByText("Approve")).toBeNull();
    expect(screen.queryByText("Reject")).toBeNull();
  });
});
