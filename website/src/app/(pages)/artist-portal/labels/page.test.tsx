// @vitest-environment jsdom
// Owner decision 2026-09-02: QR label colour moved off Edit Profile (where
// it lived behind the Premium gate) onto this print-labels screen instead,
// free for every plan. The old "My theme / classic" toggle + Premium
// upsell are gone; a LabelThemePicker now drives LabelPreview directly and
// saves the artist's pick as their new default via mutate().

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

const { mutateMock, authFetchMock, showToastMock, artistState, labelPreviewProps } = vi.hoisted(() => ({
  mutateMock: vi.fn(),
  authFetchMock: vi.fn(),
  showToastMock: vi.fn(),
  artistState: { artist: null as unknown },
  labelPreviewProps: [] as Array<Record<string, unknown>>,
}));

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/components/ArtistPortalLayout", () => ({ default: ({ children }: { children: unknown }) => children }));
vi.mock("@/hooks/useCurrentArtist", () => ({
  useCurrentArtist: () => ({ artist: artistState.artist, loading: false, profileId: null, refetch: vi.fn() }),
}));
vi.mock("@/context/ToastContext", () => ({ useToast: () => ({ showToast: showToastMock }) }));
// api-client.ts imports the real Supabase client module at load time, which
// throws without env vars. Stub it so requiring the *actual* api-client
// below (to keep the real ApiError/apiErrorMessage) doesn't blow up in test.
vi.mock("@/lib/supabase", () => ({ supabase: { auth: {}, from: () => ({}) } }));
vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, authFetch: authFetchMock, mutate: mutateMock };
});
// Mocked so we can assert on exactly what reaches it, per the task brief.
// Captures every render's props so we can check both the initial value and
// the value after a colour change.
vi.mock("@/components/labels/LabelPreview", () => ({
  default: (props: Record<string, unknown>) => {
    labelPreviewProps.push(props);
    return null;
  },
}));

import LabelsPage from "./page";
import { artists } from "@/data/artists";
import { clearPortalGetCache } from "@/lib/portal-get";

afterEach(() => cleanup());
beforeEach(() => {
  // portalGet holds a resolved response briefly so a click can join the
  // request the sidebar hover started; it must not carry between tests.
  clearPortalGetCache();
  mutateMock.mockReset();
  authFetchMock.mockReset();
  showToastMock.mockReset();
  labelPreviewProps.length = 0;
  mutateMock.mockResolvedValue({});
  authFetchMock.mockResolvedValue(new Response(JSON.stringify({ placements: [] }), { status: 200 }));

  const base = artists[0];
  artistState.artist = {
    ...base,
    // Core, not Premium/Pro: label colour must still be fully available.
    subscriptionPlan: "core",
    labelTheme: "warm",
  };
});

/** Opens the print preview via the Portfolio Label "+" button, which is
 *  always present, so the test doesn't depend on work-card selection. */
function openPreview() {
  fireEvent.click(screen.getAllByText("+")[0]);
  fireEvent.click(screen.getByText("Preview & Print"));
}

describe("artist labels page — label colour picker (owner decision 2026-09-02)", () => {
  it("shows a Label colour picker with all four themes and no Premium upsell, even on a Core plan", async () => {
    render(<LabelsPage />);
    await screen.findByText("QR Labels");

    expect(screen.getByText("Label colour")).toBeTruthy();
    for (const label of ["Classic (white)", "Warm cream", "Dark", "Accent"]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }

    expect(screen.queryByText(/Want coloured labels/)).toBeNull();
    expect(screen.queryByText(/Premium artists can pick/)).toBeNull();
    expect(screen.queryByText("Upgrade")).toBeNull();
    // The old toggle's exact button labels ("My theme" / bare "Classic"),
    // distinct from the swatch picker's "Classic (white)" swatch.
    expect(screen.queryByText("My theme")).toBeNull();
    expect(screen.queryByRole("button", { name: "Classic" })).toBeNull();
  });

  it("initialises the picker from the artist's saved labelTheme", async () => {
    render(<LabelsPage />);
    await screen.findByText("QR Labels");
    expect(screen.getByRole("button", { name: "Warm cream" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("choosing a colour reaches LabelPreview immediately and saves it as the new default via mutate", async () => {
    render(<LabelsPage />);
    await screen.findByText("QR Labels");

    openPreview();
    expect(labelPreviewProps.at(-1)?.labelTheme).toBe("warm");

    fireEvent.click(screen.getByRole("button", { name: "Dark" }));

    // Reaches the live preview straight away.
    expect(labelPreviewProps.at(-1)?.labelTheme).toBe("dark");

    // Persisted through the existing profile-update call, not authFetch.
    await waitFor(() => expect(mutateMock).toHaveBeenCalledWith(
      "/api/artist-profile",
      expect.objectContaining({ method: "PUT" }),
    ));
    const body = JSON.parse((mutateMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ label_theme: "dark" });
  });

  it("shows a warning toast (but keeps the picked colour) when saving the default fails", async () => {
    mutateMock.mockRejectedValue(new Error("network down"));
    render(<LabelsPage />);
    await screen.findByText("QR Labels");

    fireEvent.click(screen.getByRole("button", { name: "Accent" }));

    await waitFor(() => expect(showToastMock).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Accent" }).getAttribute("aria-pressed")).toBe("true");
  });
});
