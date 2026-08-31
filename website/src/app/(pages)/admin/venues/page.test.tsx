// @vitest-environment jsdom
//
// G9. The page had one button on it, the expand chevron, and no call that wrote
// anything. It now has an edit form on the expanded row, backed by the
// allowlisted PATCH on /api/admin/venues.

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

import AdminVenuesPage from "./page";

const VENUE = {
  id: "vp-1",
  user_id: "u-venue",
  slug: "copper-kettle",
  name: "Copper Kettle",
  type: "Cafe",
  location: "Hackney",
  city: "London",
  postcode: "E8 1AA",
  address_line1: "1 High Street",
  contact_name: "Sam Reed",
  email: "sam@copperkettle.co.uk",
  phone: "020 7000 0000",
  placement_count: 2,
  created_at: "2026-04-01T09:00:00.000Z",
};

function reply(venues: unknown[]) {
  return { ok: true, status: 200, json: async () => ({ venues }) } as unknown as Response;
}

beforeEach(() => {
  authFetchMock.mockReset();
  mutateMock.mockReset();
  authFetchMock.mockResolvedValue(reply([VENUE]));
  mutateMock.mockResolvedValue({ success: true, fields: ["contact_name"] });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function openEditor() {
  fireEvent.click(await screen.findByText("Copper Kettle"));
  fireEvent.click(await screen.findByText(/edit details/i));
}

describe("G9: the venue record can be corrected from the panel", () => {
  it("PATCHes only the fields that changed", async () => {
    render(<AdminVenuesPage />);
    await openEditor();

    fireEvent.change(screen.getByLabelText("Contact name"), {
      target: { value: "Alex Reed" },
    });
    fireEvent.click(screen.getByText("Save changes"));

    await waitFor(() => expect(mutateMock).toHaveBeenCalledTimes(1));
    const [url, init] = mutateMock.mock.calls[0];
    expect(url).toBe("/api/admin/venues");
    expect(init).toMatchObject({ method: "PATCH" });
    expect(JSON.parse((init as { body: string }).body)).toEqual({
      id: "vp-1",
      fields: { contact_name: "Alex Reed" },
    });
  });

  it("sends nothing when nothing was edited", async () => {
    render(<AdminVenuesPage />);
    await openEditor();
    fireEvent.click(screen.getByText("Save changes"));
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("carries several edits in one request", async () => {
    render(<AdminVenuesPage />);
    await openEditor();

    fireEvent.change(screen.getByLabelText("Contact name"), { target: { value: "Alex Reed" } });
    fireEvent.change(screen.getByLabelText("Postcode"), { target: { value: "E8 2BB" } });
    fireEvent.click(screen.getByText("Save changes"));

    await waitFor(() => expect(mutateMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse((mutateMock.mock.calls[0][1] as { body: string }).body).fields).toEqual({
      contact_name: "Alex Reed",
      postcode: "E8 2BB",
    });
  });

  it("reloads so the panel shows the saved record", async () => {
    render(<AdminVenuesPage />);
    await openEditor();
    fireEvent.change(screen.getByLabelText("Contact name"), { target: { value: "Alex Reed" } });
    fireEvent.click(screen.getByText("Save changes"));

    await waitFor(() => expect(authFetchMock).toHaveBeenCalledTimes(2));
  });

  it("reports a rejected save rather than looking like it worked", async () => {
    mutateMock.mockRejectedValue(new Error("nope"));
    render(<AdminVenuesPage />);
    await openEditor();
    fireEvent.change(screen.getByLabelText("Contact name"), { target: { value: "Alex Reed" } });
    fireEvent.click(screen.getByText("Save changes"));

    expect(await screen.findByText(/network error/i)).toBeTruthy();
  });

  it("offers no field the endpoint would refuse", async () => {
    // The route's allowlist is the boundary; the form must not invite an admin
    // to type into something that will 400.
    render(<AdminVenuesPage />);
    await openEditor();
    for (const label of ["Slug", "User id", "Subscription plan"]) {
      expect(screen.queryByLabelText(label)).toBeNull();
    }
  });
});
