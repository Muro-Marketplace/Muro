// @vitest-environment jsdom
// 05 (authFetch->mutate). setDefault / confirmDelete / submit used authFetch with a
// manual res.ok check. They now go through mutate (throws on a non-2xx), so a rejected
// change surfaces the error toast and the success toast + reload only run on a 2xx. The
// read GET (loadAddresses) stays on authFetch. This pins the setDefault path.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

const { authFetchMock, mutateMock, showToastMock } = vi.hoisted(() => ({
  authFetchMock: vi.fn(),
  mutateMock: vi.fn(),
  showToastMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ supabase: { auth: {}, from: () => ({}) } }));
vi.mock("@/lib/api-client", async (orig) => {
  const actual = await orig<typeof import("@/lib/api-client")>();
  return { ...actual, authFetch: authFetchMock, mutate: mutateMock };
});
vi.mock("@/context/ToastContext", () => ({ useToast: () => ({ showToast: showToastMock }) }));
vi.mock("@/components/CustomerPortalLayout", () => ({ default: ({ children }: { children: unknown }) => children }));
vi.mock("@/components/EmptyState", () => ({ default: () => null }));
vi.mock("@/components/ConfirmDialog", () => ({ default: () => null }));

import CustomerAddressesPage from "./page";
import { ApiError } from "@/lib/api-client";

const ADDRESS = {
  id: "addr1",
  full_name: "Maya Chen",
  line1: "1 Test Street",
  line2: null,
  city: "London",
  postcode: "E1 6AN",
  country: "GB",
  is_default: false, // -> the "Set default" button renders
  created_at: "2026-01-01T00:00:00Z",
};

function addressesGet() {
  // Fresh Response each call so the body survives the mount load + post-action reload.
  return new Response(JSON.stringify({ addresses: [ADDRESS] }), { status: 200 });
}

afterEach(() => cleanup());
beforeEach(() => {
  authFetchMock.mockReset();
  mutateMock.mockReset();
  showToastMock.mockReset();
  authFetchMock.mockImplementation(() => Promise.resolve(addressesGet()));
});

describe("customer addresses setDefault (05 mutate)", () => {
  it("surfaces an error toast and no success toast when the PATCH fails", async () => {
    mutateMock.mockRejectedValue(new ApiError(500, "boom", "boom", {}));

    render(<CustomerAddressesPage />);
    fireEvent.click(await screen.findByText("Set default"));

    await waitFor(() =>
      expect(showToastMock).toHaveBeenCalledWith("Couldn't set default. Try again.", { variant: "error" }),
    );
    expect(showToastMock).not.toHaveBeenCalledWith("Default address updated");
    expect(mutateMock).toHaveBeenCalledWith(
      "/api/customer-addresses/addr1",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("toasts success on a confirmed 2xx", async () => {
    mutateMock.mockResolvedValue({});

    render(<CustomerAddressesPage />);
    fireEvent.click(await screen.findByText("Set default"));

    await waitFor(() => expect(showToastMock).toHaveBeenCalledWith("Default address updated"));
    expect(showToastMock).not.toHaveBeenCalledWith("Couldn't set default. Try again.", { variant: "error" });
  });
});
