// @vitest-environment jsdom
//
// G25. The Approved and Rejected tabs were permanently empty: /api/admin/
// moderation exported GET only, and the one write path that touched queue rows
// (/api/admin/blogs/[id]) is scoped to entity_type='blog', so a feature_request
// row could never leave 'pending'. The endpoint now has a PATCH; this page had
// no control that called it, so the inbox still could not be cleared from the
// page an admin actually reads it on.

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

import FeatureRequestsAdminPage from "./page";

const ROW = {
  id: "11111111-2222-4333-8444-555555555555",
  entity_id: "fr-1",
  submitted_by_email: "someone@example.com",
  status: "pending",
  payload: {
    type: "feature_request",
    title: "Let venues reorder their wall",
    description: "Drag and drop would beat the current form.",
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
  vi.spyOn(window, "prompt").mockReturnValue("Out of scope for now.");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("G25: a feature request can be triaged out of pending", () => {
  it("approves through PATCH /api/admin/moderation", async () => {
    render(<FeatureRequestsAdminPage />);
    fireEvent.click(await screen.findByText("Approve"));

    await waitFor(() => expect(mutateMock).toHaveBeenCalledTimes(1));
    const [url, init] = mutateMock.mock.calls[0];
    expect(url).toBe("/api/admin/moderation");
    expect(init).toMatchObject({ method: "PATCH" });
    expect(JSON.parse((init as { body: string }).body)).toEqual({
      id: ROW.id,
      action: "approve",
    });
  });

  it("rejects with the typed reason", async () => {
    render(<FeatureRequestsAdminPage />);
    fireEvent.click(await screen.findByText("Reject"));

    await waitFor(() => expect(mutateMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse((mutateMock.mock.calls[0][1] as { body: string }).body)).toEqual({
      id: ROW.id,
      action: "reject",
      reason: "Out of scope for now.",
    });
  });

  it("sends the queue row id, not the entity id", async () => {
    // The decision endpoint keys on moderation_queue.id. Passing entity_id
    // would 404 every time, which is exactly the kind of dead control this
    // item is about.
    render(<FeatureRequestsAdminPage />);
    fireEvent.click(await screen.findByText("Approve"));

    await waitFor(() => expect(mutateMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse((mutateMock.mock.calls[0][1] as { body: string }).body);
    expect(body.id).toBe(ROW.id);
    expect(body.id).not.toBe(ROW.entity_id);
  });

  it("reloads the list so the row leaves the pending tab", async () => {
    render(<FeatureRequestsAdminPage />);
    fireEvent.click(await screen.findByText("Approve"));
    await waitFor(() => expect(authFetchMock).toHaveBeenCalledTimes(2));
  });

  it("offers no decision controls on an already-decided row", async () => {
    authFetchMock.mockResolvedValue(reply({ rows: [{ ...ROW, status: "approved" }] }));
    render(<FeatureRequestsAdminPage />);
    fireEvent.click(await screen.findByText("approved"));
    await screen.findByText("Let venues reorder their wall");
    expect(screen.queryByText("Approve")).toBeNull();
    expect(screen.queryByText("Reject")).toBeNull();
  });

  it("abandons a reject when the prompt is dismissed", async () => {
    vi.mocked(window.prompt).mockReturnValue(null);
    render(<FeatureRequestsAdminPage />);
    fireEvent.click(await screen.findByText("Reject"));
    expect(mutateMock).not.toHaveBeenCalled();
  });
});
