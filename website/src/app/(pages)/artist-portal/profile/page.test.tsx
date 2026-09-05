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
vi.mock("@/context/ConfirmContext", () => ({ useConfirm: () => ({ confirm: vi.fn(async () => true) }) }));
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
  // The editor this page mounts today is the real one, sharing a component with
  // My Portfolio and writing through the works API. The point that survives from
  // E41-f is the one about the dead keys: whatever edits works here, it is never
  // the localStorage mirror that was deleted.
  it("never writes the dead localStorage keys", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    render(<ProfileEditorPage />);

    await screen.findByText("Your Works");
    expect(screen.getAllByText("My Work").length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByText("My Work")[0]);

    const keys = setItem.mock.calls.map((c) => c[0]);
    expect(keys).not.toContain("wallplace-artist-works");
    expect(keys).not.toContain("wallplace-artist-profile");
  });
});

// ── The Works section is the full editor (owner request 2026-09-06) ─────────
//
// This replaces a block that pinned the opposite: a read-only grid and a "Go to
// My Portfolio" button, from the 2026-09-02 request to keep artists in the
// portfolio editor. The owner reversed that. The tests are replaced rather than
// repaired, because they encoded the old decision correctly and there is nothing
// wrong with them except that the decision changed.
describe("Works section mounts the full editor", () => {
  beforeEach(() => pushMock.mockReset());

  it("offers the editor's own add control, not a link away", async () => {
    render(<ProfileEditorPage />);
    await screen.findByText("Your Works");

    expect(screen.getAllByText("+ Add New Work").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Go to My Portfolio" })).toBeNull();
    expect(screen.queryByText(/Works are added and edited in My Portfolio/)).toBeNull();
  });

  it("carries the shipping defaults across too", async () => {
    render(<ProfileEditorPage />);
    await screen.findByText("Your Works");

    expect(screen.getByText("Default UK Shipping")).toBeTruthy();
    expect(screen.getByText("International Shipping")).toBeTruthy();
  });

  it("opens the work form in place", async () => {
    render(<ProfileEditorPage />);
    await screen.findByText("Your Works");

    fireEvent.click(screen.getAllByText("+ Add New Work")[0]);
    await waitFor(() => expect(screen.getAllByText("Add New Work").length).toBeGreaterThan(0));
  });

  it("keeps the profile's Save button clean while a work is being edited", async () => {
    // Works save as they go, so touching one must not make the profile look
    // dirty. If it did, the Save button would promise something it does not do.
    render(<ProfileEditorPage />);
    await screen.findByText("Your Works");

    const saveButton = screen.getAllByRole("button", { name: "Save Changes" })[0];
    expect(saveButton.hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getAllByText("+ Add New Work")[0]);
    await waitFor(() => expect(screen.getAllByText("Add New Work").length).toBeGreaterThan(0));

    expect(
      screen.getAllByRole("button", { name: "Save Changes" })[0].hasAttribute("disabled"),
      "editing a work made the profile's Save button think the profile was dirty",
    ).toBe(true);
  });

  it("still saves the profile on its own button, and still shows works", async () => {
    render(<ProfileEditorPage />);
    await screen.findByText("Your Works");

    fireEvent.change(screen.getByPlaceholderText("e.g. Hackney, London"), {
      target: { value: "Peckham, London" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Save Changes" })[0]);

    await waitFor(() => expect(mutateMock).toHaveBeenCalled());
    expect(screen.getAllByText("My Work").length).toBeGreaterThan(0);
  });

  it("shows the editor's own empty state rather than pointing at another page", async () => {
    artistState.artist = { ...artists[0], works: [] };
    render(<ProfileEditorPage />);
    await screen.findByText("Your Works");

    expect(screen.queryByText(/Use .No works yet/)).toBeNull();
    expect(screen.queryByText(/Go to My Portfolio/)).toBeNull();
    expect(screen.getAllByText("+ Add New Work").length).toBeGreaterThan(0);
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

describe("Programmes opt-in (Wallplace Programmes phase 1)", () => {
  const PROGRAMME_LABEL = "Programmes (about £10 a month per piece, chosen by Wallplace)";

  function programmeToggle(): HTMLButtonElement {
    const label = screen.getByText(PROGRAMME_LABEL).closest("label");
    if (!label) throw new Error("Programmes label is not inside a toggle row");
    const button = label.querySelector("button");
    if (!button) throw new Error("Programmes row has no toggle button");
    return button as HTMLButtonElement;
  }

  /** The tick is an inline SVG rendered only while the flag is on. */
  const isTicked = (b: HTMLButtonElement) => b.querySelector("svg") !== null;

  function savedBody(): Record<string, unknown> {
    const call = mutateMock.mock.calls.at(-1);
    return JSON.parse((call?.[1] as { body: string }).body);
  }

  it("offers the opt-in beside the other deal types, and says what is being agreed to", async () => {
    render(<ProfileEditorPage />);
    await screen.findByText("Deal types");

    // The rent and who chooses the pieces sit on the control itself, because
    // that is the sentence the artist is ticking. Artist agreement 9A.
    expect(screen.getByText(PROGRAMME_LABEL)).toBeTruthy();
    expect(
      screen.getByText(/not for sale anywhere else until it comes down/i),
    ).toBeTruthy();
  });

  it("starts off for an artist who has never chosen", async () => {
    // artists[0] is a fixture from before the flag existed, which is exactly
    // the case that must not be opted in by accident.
    render(<ProfileEditorPage />);
    await screen.findByText("Deal types");

    expect(isTicked(programmeToggle())).toBe(false);
  });

  it("does not opt an artist in as a side effect of an unrelated edit", async () => {
    // Save is disabled until something changes, so dirty the form the way the
    // rest of this file does. The point is that editing a location and saving
    // must not carry an opt-in the artist never gave.
    render(<ProfileEditorPage />);
    await screen.findByText("Deal types");
    fireEvent.change(screen.getByPlaceholderText("e.g. Hackney, London"), {
      target: { value: "Peckham, London" },
    });
    fireEvent.click(screen.getAllByText("Save Changes")[0]);

    await waitFor(() => expect(mutateMock).toHaveBeenCalled());
    expect(savedBody().open_to_programme).toBe(false);
  });

  it("sends the opt-in once the artist ticks it", async () => {
    render(<ProfileEditorPage />);
    await screen.findByText("Deal types");

    fireEvent.click(programmeToggle());
    expect(isTicked(programmeToggle())).toBe(true);

    fireEvent.click(screen.getAllByText("Save Changes")[0]);
    await waitFor(() => expect(mutateMock).toHaveBeenCalled());
    expect(savedBody().open_to_programme).toBe(true);
  });

  it("shows an existing opt-in as already ticked, and can be withdrawn", async () => {
    artistState.artist = { ...artists[0], openToProgramme: true, works: [] };
    render(<ProfileEditorPage />);
    await screen.findByText("Deal types");

    expect(isTicked(programmeToggle())).toBe(true);

    fireEvent.click(programmeToggle());
    fireEvent.click(screen.getAllByText("Save Changes")[0]);

    await waitFor(() => expect(mutateMock).toHaveBeenCalled());
    expect(savedBody().open_to_programme).toBe(false);
  });
});
