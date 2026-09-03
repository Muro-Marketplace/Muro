// @vitest-environment jsdom
/**
 * Artist Showroom editor, brought back on 2026-09-03 (parked 2026-08-28).
 * The page loads the wall and its layouts with the bearer token and mounts
 * the visualiser in artist_showroom mode; a missing wall says so.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/feature-flags", () => ({ isFlagOn: () => true }));
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ session: { access_token: "tok-artist" }, loading: false }),
}));
vi.mock("@/context/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "w1" }),
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("next/dynamic", () => ({
  default: () =>
    function VisualizerStub(props: { mode: string; wall?: { name: string }; initialLayout?: { id: string } }) {
      return <div data-testid="visualizer" data-mode={props.mode} data-wall={props.wall?.name} data-layout={props.initialLayout?.id} />;
    },
}));

import ArtistShowroomEditorPage from "./page";

const WALL = { id: "w1", user_id: "u1", owner_type: "artist", name: "Studio wall", kind: "preset", preset_id: "minimal_white", source_image_path: null, width_cm: 300, height_cm: 240, wall_color_hex: "F5F1EB", perspective_homography: null, segmentation_mask_path: null, notes: null, created_at: "", updated_at: "" };
const LAYOUT = { id: "l1", wall_id: "w1", user_id: "u1", name: "Layout 1", items: [], layout_hash: null, last_render_id: null, created_at: "", updated_at: "" };

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("/artist-portal/showroom/[id]", () => {
  it("loads the wall and layouts with the bearer token and mounts the visualiser in artist_showroom mode", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/walls/w1") return new Response(JSON.stringify({ wall: WALL, sourceImageUrl: null }), { status: 200 });
      if (url === "/api/walls/w1/layouts") return new Response(JSON.stringify({ layouts: [LAYOUT] }), { status: 200 });
      return new Response("{}", { status: 404 });
    });
    render(<ArtistShowroomEditorPage />);
    const stub = await screen.findByTestId("visualizer");
    expect(stub.getAttribute("data-mode")).toBe("artist_showroom");
    expect(stub.getAttribute("data-wall")).toBe("Studio wall");
    expect(stub.getAttribute("data-layout")).toBe("l1");
    for (const [, init] of fetchMock.mock.calls as Array<[string, RequestInit]>) {
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-artist");
    }
  });

  it("says the scene is missing when the wall read 404s", async () => {
    fetchMock.mockImplementation(async () => new Response("{}", { status: 404 }));
    render(<ArtistShowroomEditorPage />);
    expect(await screen.findByText("Scene not found")).toBeTruthy();
  });

  it("lets the artist show the wall on their profile, patching the wall with the bearer token", async () => {
    const calls: Array<[string, RequestInit]> = [];
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        calls.push([url, init]);
        return new Response(JSON.stringify({ wall: { ...WALL, is_public_on_profile: true } }), { status: 200 });
      }
      if (url === "/api/walls/w1") return new Response(JSON.stringify({ wall: WALL, sourceImageUrl: null }), { status: 200 });
      if (url === "/api/walls/w1/layouts") return new Response(JSON.stringify({ layouts: [LAYOUT] }), { status: 200 });
      return new Response("{}", { status: 404 });
    });
    render(<ArtistShowroomEditorPage />);
    const box = (await screen.findByLabelText("Show on my profile")) as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    expect(box.checked).toBe(true);
    await waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0][0]).toBe("/api/walls/w1");
    expect(JSON.parse(String(calls[0][1].body))).toEqual({ is_public_on_profile: true });
    expect((calls[0][1].headers as Record<string, string>).Authorization).toBe("Bearer tok-artist");
  });
});
