// @vitest-environment jsdom
// E41-a. The worst data-loss path: adding/editing a work used to fire the POST and
// immediately close the form + toast "Artwork added", so a 402/403/500 lost the work
// silently. It now goes through useSaveAction, so success is reported only on a
// confirmed write and a failure keeps the form open with the real error.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

const { mutateMock, showToastMock, artistState } = vi.hoisted(() => ({
  mutateMock: vi.fn(),
  showToastMock: vi.fn(),
  artistState: { works: [] as unknown[] },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/artist-portal/portfolio",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/supabase", () => ({ supabase: { auth: {}, from: () => ({}) } }));
// Keep the real ApiError/NetworkError (useSaveAction uses instanceof); override the IO.
vi.mock("@/lib/api-client", async (orig) => {
  const actual = await orig<typeof import("@/lib/api-client")>();
  return { ...actual, mutate: mutateMock, authFetch: vi.fn(async () => new Response("{}", { status: 200 })) };
});
vi.mock("@/context/ToastContext", () => ({ useToast: () => ({ showToast: showToastMock }) }));
vi.mock("@/context/ConfirmContext", () => ({ useConfirm: () => ({ confirm: vi.fn(async () => true) }) }));
vi.mock("@/lib/upload", () => ({ uploadImage: vi.fn(async () => "https://cdn/x.png") }));
vi.mock("@/components/ArtistPortalLayout", () => ({ default: ({ children }: { children: unknown }) => children }));
vi.mock("@/hooks/useCurrentArtist", () => ({
  useCurrentArtist: () => ({ artist: { slug: "alice", name: "Alice", works: artistState.works }, loading: false }),
}));

import PortfolioPage from "./page";
import { ApiError } from "@/lib/api-client";

afterEach(() => cleanup());
beforeEach(() => {
  mutateMock.mockReset();
  showToastMock.mockReset();
  artistState.works = [];
});

// A work complete enough for the portfolio grid to render a card for it.
const WORK = {
  id: "w1",
  title: "My Work",
  medium: "Oil",
  dimensions: "50x50cm",
  priceBand: "",
  pricing: [{ label: "Medium", price: 200 }],
  available: true,
  color: "#C17C5A",
  image: "https://cdn/a.png",
  orientation: "landscape",
  images: [],
  description: "",
  frameOptions: [],
};

// The form renders in two layout variants (desktop + mobile), so controls appear
// twice; they all drive the same component state, so targeting the first is fine.
const TITLE_PLACEHOLDER = "e.g. Last Light on Mare Street";
const formIsOpen = () => screen.queryAllByPlaceholderText(TITLE_PLACEHOLDER).length > 0;

/** Open the Add form and fill the two fields handleSubmit requires. */
function openAddAndFill() {
  fireEvent.click(screen.getAllByText("+ Add New Work")[0]);
  fireEvent.change(screen.getAllByPlaceholderText(TITLE_PLACEHOLDER)[0], {
    target: { value: "Test Work" },
  });
  // defaultSizes already gives one labelled size row at price 0; give it a price.
  fireEvent.change(screen.getAllByPlaceholderText("Price")[0], { target: { value: "120" } });
}

describe("artist portfolio add/edit save (E41-a)", () => {
  it("keeps the form open and shows the real error when the write fails, with no success toast", async () => {
    mutateMock.mockRejectedValue(new ApiError(403, "post_limit_reached", "post_limit_reached", {}));
    render(<PortfolioPage />);

    openAddAndFill();
    fireEvent.click(screen.getAllByText("Save Work")[0]);

    // The error surfaces once the rejected write settles.
    await waitFor(() =>
      expect(showToastMock).toHaveBeenCalledWith("post_limit_reached", { variant: "error", durationMs: 5000 }),
    );
    // The false-success toast must NOT fire...
    expect(showToastMock).not.toHaveBeenCalledWith("Artwork added");
    // ...and the form stays open (its title field is still on screen) so the work is not lost.
    expect(formIsOpen()).toBe(true);
  });

  it("reports success and closes the form only after a confirmed write", async () => {
    mutateMock.mockResolvedValue({ savedRow: { id: "w1" } });
    render(<PortfolioPage />);

    openAddAndFill();
    fireEvent.click(screen.getAllByText("Save Work")[0]);

    await waitFor(() => expect(showToastMock).toHaveBeenCalledWith("Artwork added"));
    // The Add form closes once the confirmed save resolves.
    await waitFor(() => expect(formIsOpen()).toBe(false));
    expect(mutateMock).toHaveBeenCalledTimes(1);
  });
});

const errorToastFired = () =>
  showToastMock.mock.calls.some((c) => c[1] && (c[1] as { variant?: string }).variant === "error");

describe("artist portfolio delete (E41-b)", () => {
  it("keeps the work and surfaces the error when the delete fails", async () => {
    mutateMock.mockRejectedValue(new ApiError(500, "Server error", "server_error", {}));
    artistState.works = [WORK];
    render(<PortfolioPage />);
    expect(screen.getAllByText("My Work").length).toBeGreaterThan(0);

    // The card's Remove is confirm-gated; confirm is mocked to resolve true.
    // Reveal the per-card hover overlay that holds Edit / Duplicate / Remove.
    fireEvent.mouseOver(screen.getAllByText("My Work")[0]);
    fireEvent.click((await screen.findAllByText("Remove"))[0]);

    await waitFor(() => expect(errorToastFired()).toBe(true));
    // Fail-before: the old fire-and-forget delete removed the card regardless. Now
    // the rejected DELETE rolls the removal back, so the work is still listed.
    expect(screen.getAllByText("My Work").length).toBeGreaterThan(0);
  });

  it("removes the work only after the delete confirms", async () => {
    mutateMock.mockResolvedValue({ ok: true });
    artistState.works = [WORK];
    render(<PortfolioPage />);
    expect(screen.getAllByText("My Work").length).toBeGreaterThan(0);

    // Reveal the per-card hover overlay that holds Edit / Duplicate / Remove.
    fireEvent.mouseOver(screen.getAllByText("My Work")[0]);
    fireEvent.click((await screen.findAllByText("Remove"))[0]);

    await waitFor(() =>
      expect(mutateMock).toHaveBeenCalledWith("/api/artist-works?id=w1", { method: "DELETE" }),
    );
    await waitFor(() => expect(screen.queryAllByText("My Work")).toHaveLength(0));
  });
});

describe("artist portfolio save posts only changed works (E41-c)", () => {
  it("adding one work to an existing portfolio POSTs only the new work, not all of them", async () => {
    mutateMock.mockResolvedValue({ savedRow: { id: "wnew" } });
    artistState.works = [
      { ...WORK, id: "w1", title: "Existing One" },
      { ...WORK, id: "w2", title: "Existing Two" },
    ];
    render(<PortfolioPage />);
    await screen.findAllByText("Existing One");

    openAddAndFill();
    fireEvent.click(screen.getAllByText("Save Work")[0]);

    await waitFor(() => expect(showToastMock).toHaveBeenCalledWith("Artwork added"));
    // Fail-before: the old postWorks re-POSTed the whole portfolio (3 calls). Now the
    // two unchanged existing works are diffed out and only the new one is POSTed.
    expect(mutateMock).toHaveBeenCalledTimes(1);
  });
});

describe("shipping settings save (05 E43-d)", () => {
  it("shows a success toast only after a confirmed save", async () => {
    mutateMock.mockResolvedValue({});
    render(<PortfolioPage />);
    const saveBtn = await screen.findByText("Save Shipping Settings");

    fireEvent.click(saveBtn);

    await waitFor(() =>
      expect(mutateMock).toHaveBeenCalledWith("/api/artist-profile", expect.objectContaining({ method: "PUT" })),
    );
    await waitFor(() => expect(showToastMock).toHaveBeenCalledWith("Shipping settings saved"));
  });

  it("shows an error toast and no success when the save fails", async () => {
    mutateMock.mockRejectedValue(new ApiError(500, "server exploded", "server_error", {}));
    render(<PortfolioPage />);
    const saveBtn = await screen.findByText("Save Shipping Settings");

    fireEvent.click(saveBtn);

    // Fail-before: the old `authFetch(...).catch(() => {})` swallowed the failure and
    // gave no feedback at all, so the save silently no-op'd.
    await waitFor(() =>
      expect(showToastMock).toHaveBeenCalledWith("server exploded", { variant: "error" }),
    );
    expect(showToastMock).not.toHaveBeenCalledWith("Shipping settings saved");
  });
});
