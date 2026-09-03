// @vitest-environment jsdom
// E41-f. The profile page had a dead SECOND artwork editor that wrote only
// localStorage("wallplace-artist-works") (discarded on refetch), plus an unread
// "wallplace-artist-profile" mirror. It has been deleted (deleting beats fixing):
// the works grid is read-only and management goes via the /artist-portal/portfolio
// link. This pins that no inline editor opens and the dead keys are never written.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

const { showToastMock, artistState, pushMock, mutateMock } = vi.hoisted(() => ({
  showToastMock: vi.fn(),
  artistState: { artist: null as unknown },
  pushMock: vi.fn(),
  mutateMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: pushMock }),
}));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: unknown; href: string }) => <a href={href}>{children as never}</a> }));
vi.mock("@/lib/supabase", () => ({ supabase: { auth: {}, from: () => ({}) } }));
// Keep the real ApiError (handleSave's catch does `instanceof ApiError`);
// override only mutate (what handleSave actually writes through) and
// authFetch (unused by this page, kept as a harmless default).
vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    authFetch: vi.fn(async () => new Response("{}", { status: 200 })),
    mutate: mutateMock,
  };
});
vi.mock("@/context/ToastContext", () => ({ useToast: () => ({ showToast: showToastMock }) }));
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@b.com", user_metadata: {} }, loading: false }),
}));
vi.mock("@/lib/upload", () => ({ uploadImage: vi.fn(async () => "https://cdn/x.png") }));
vi.mock("@/lib/use-unsaved-warning", () => ({ useUnsavedWarning: () => {} }));
vi.mock("@/components/ArtistPortalLayout", () => ({ default: ({ children }: { children: unknown }) => children }));
vi.mock("@/hooks/useCurrentArtist", () => ({
  useCurrentArtist: () => ({ artist: artistState.artist, loading: false, profileId: null, refetch: vi.fn() }),
}));

import ProfileEditorPage from "./page";
import { artists } from "@/data/artists";

afterEach(() => cleanup());
beforeEach(() => {
  showToastMock.mockReset();
  mutateMock.mockReset();
  mutateMock.mockResolvedValue({ success: true });
  // A real artist fixture (so the profile-building effect has every field it maps),
  // with a single known work to look for in the grid.
  const base = artists[0];
  artistState.artist = { ...base, works: [{ ...base.works[0], id: "w1", title: "My Work" }] };
});

describe("artist profile page — no dead localStorage artwork editor (E41-f)", () => {
  it("shows works read-only, opens no inline editor, and never writes the dead keys", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    render(<ProfileEditorPage />);

    await screen.findByText("Your Works");
    expect(screen.getAllByText("My Work").length).toBeGreaterThan(0);

    // Clicking a work card must NOT open the inline edit modal that used to live here
    // (the deleted editor's "Edit Work" / "Add New Work" form).
    fireEvent.click(screen.getAllByText("My Work")[0]);
    expect(screen.queryByText("Edit Work")).toBeNull();
    expect(screen.queryByText("Add New Work")).toBeNull();

    // The dead editor's localStorage keys are never written.
    const keys = setItem.mock.calls.map((c) => c[0]);
    expect(keys).not.toContain("wallplace-artist-works");
    expect(keys).not.toContain("wallplace-artist-profile");
  });
});

describe("Works section routes to the Portfolio editor (owner request 2026-09-02: inline quick-add removed)", () => {
  beforeEach(() => pushMock.mockReset());

  it("shows the note and a 'Go to My Portfolio' link to /artist-portal/portfolio when the form is clean", async () => {
    render(<ProfileEditorPage />);
    await screen.findByText("Your Works");

    expect(
      screen.getByText("Works are added and edited in My Portfolio. Save your profile changes first."),
    ).toBeTruthy();
    const link = screen.getByRole("link", { name: "Go to My Portfolio" });
    expect(link.getAttribute("href")).toBe("/artist-portal/portfolio");
  });

  it("swaps to a 'Save and go to My Portfolio' button once the form is dirty, and only navigates after a successful save", async () => {
    render(<ProfileEditorPage />);
    await screen.findByText("Your Works");

    // Dirty the form via the Location field.
    fireEvent.change(screen.getByPlaceholderText("e.g. Hackney, London"), {
      target: { value: "Peckham, London" },
    });

    expect(screen.queryByRole("link", { name: "Go to My Portfolio" })).toBeNull();
    const saveAndGo = screen.getByRole("button", { name: "Save and go to My Portfolio" });

    fireEvent.click(saveAndGo);

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/artist-portal/portfolio"));
  });

  it("stays put and shows the existing error toast, without navigating, when the save fails", async () => {
    mutateMock.mockRejectedValueOnce(new Error("network down"));
    render(<ProfileEditorPage />);
    await screen.findByText("Your Works");

    fireEvent.change(screen.getByPlaceholderText("e.g. Hackney, London"), {
      target: { value: "Peckham, London" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save and go to My Portfolio" }));

    await waitFor(() => expect(showToastMock).toHaveBeenCalled());
    expect(pushMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save and go to My Portfolio" })).toBeTruthy();
  });

  it("points the empty-state copy at the new button", async () => {
    artistState.artist = { ...artists[0], works: [] };
    render(<ProfileEditorPage />);
    await screen.findByText(/No works yet/);
    // JSX renders &ldquo;/&rdquo; as curly quotes, not straight ones.
    expect(screen.getByText("No works yet. Use “Go to My Portfolio” to add your first piece.")).toBeTruthy();
  });
});

describe("Save changes floats in a sticky bar (owner request 2026-09-02)", () => {
  it("renders the (first) Save Changes button inside an element whose className contains 'sticky'", async () => {
    render(<ProfileEditorPage />);
    await screen.findByText("Your Works");

    const saveButtons = screen.getAllByText("Save Changes");
    const stickyAncestor = saveButtons[0].closest('[class*="sticky"]');
    expect(stickyAncestor).not.toBeNull();
  });

  it("does not cover the heading at rest: the heading renders above the sticky bar's own content", async () => {
    render(<ProfileEditorPage />);
    const heading = await screen.findByText("Edit Profile");
    // A plain sanity check that the heading actually mounted as a heading,
    // sticky positioning itself is a layout concern jsdom cannot measure.
    expect(heading.tagName).toBe("H1");
  });
});

describe("profile theme picker — label colour moved off this page (owner decision 2026-09-02)", () => {
  it("shows the profile background picker but no QR label colour picker", async () => {
    render(<ProfileEditorPage />);
    await screen.findByText("Profile theme");

    expect(screen.getByText("Public profile background")).toBeTruthy();
    // A PROFILE_THEMES description, proves the background picker's swatches render.
    expect(screen.getByText("The default Wallplace cream. Calm, gallery-neutral.")).toBeTruthy();

    expect(screen.queryByText("QR label colour")).toBeNull();
    expect(screen.queryByText(/Profile & label theme/)).toBeNull();
    expect(screen.queryByText(/Pick a colour scheme for your public profile and your QR labels/)).toBeNull();
    // A LABEL_THEMES-only label, absent now that the picker itself is gone.
    expect(screen.queryByText("Classic (white)")).toBeNull();
  });
});
