// @vitest-environment jsdom
// E41-f. The profile page had a dead SECOND artwork editor that wrote only
// localStorage("wallplace-artist-works") (discarded on refetch), plus an unread
// "wallplace-artist-profile" mirror. It has been deleted (deleting beats fixing):
// the works grid is read-only and management goes via the /artist-portal/portfolio
// link. This pins that no inline editor opens and the dead keys are never written.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

const { showToastMock, artistState } = vi.hoisted(() => ({
  showToastMock: vi.fn(),
  artistState: { artist: null as unknown },
}));

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: unknown; href: string }) => <a href={href}>{children as never}</a> }));
vi.mock("@/lib/supabase", () => ({ supabase: { auth: {}, from: () => ({}) } }));
vi.mock("@/lib/api-client", () => ({ authFetch: vi.fn(async () => new Response("{}", { status: 200 })) }));
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
