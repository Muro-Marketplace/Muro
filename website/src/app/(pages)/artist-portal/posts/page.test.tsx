// @vitest-environment jsdom
//
// D25. The post studio asks for /api/placements?status=active, but that route
// ignores `status` (it reads only `archived`), so it received placements in
// every state and matched them on title alone. A pending request, a declined
// one or a completed one all produced a "Now showing at <venue>" line for work
// that is not on that wall.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const { authFetchMock, artistState, generatorProps } = vi.hoisted(() => ({
  authFetchMock: vi.fn(),
  artistState: { works: [] as unknown[] },
  generatorProps: { last: null as Record<string, unknown> | null },
}));

vi.mock("@/lib/api-client", () => ({ authFetch: authFetchMock }));
vi.mock("@/components/ArtistPortalLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("next/image", () => ({ default: () => <span /> }));
vi.mock("@/hooks/useCurrentArtist", () => ({
  useCurrentArtist: () => ({
    artist: { slug: "alice", name: "Alice", works: artistState.works },
    loading: false,
  }),
}));
// Capture what the generator is told, which is where the banner comes from.
vi.mock("@/components/social/InstagramPostGenerator", () => ({
  default: (props: Record<string, unknown>) => {
    generatorProps.last = props;
    return <div data-testid="generator" />;
  },
}));

import ArtistPostsPage from "./page";

function placementsReply(placements: unknown[]) {
  return { json: async () => ({ placements }) } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  generatorProps.last = null;
  artistState.works = [{ id: "w1", title: "Vietnamese Village", image: "https://cdn/a.png", pricing: [] }];
});
afterEach(cleanup);

describe("post studio 'Now showing at' (D25)", () => {
  it("ignores a placement that is not active, even when the title matches", async () => {
    authFetchMock.mockResolvedValue(
      placementsReply([
        { workTitle: "Vietnamese Village", venue: "The Copper Kettle", status: "pending" },
      ]),
    );
    render(<ArtistPostsPage />);
    await waitFor(() => expect(screen.getByTestId("generator")).toBeTruthy());
    await waitFor(() => expect(generatorProps.last).not.toBeNull());
    expect(generatorProps.last?.showingAtVenueName).toBeNull();
  });

  it("uses an active placement when the title matches", async () => {
    authFetchMock.mockResolvedValue(
      placementsReply([
        { workTitle: "Vietnamese Village", venue: "The Copper Kettle", status: "active" },
      ]),
    );
    render(<ArtistPostsPage />);
    await waitFor(() => expect(generatorProps.last?.showingAtVenueName).toBe("The Copper Kettle"));
  });

  it("picks the active placement out of a mixed list rather than the first match", async () => {
    authFetchMock.mockResolvedValue(
      placementsReply([
        { workTitle: "Vietnamese Village", venue: "Declined Cafe", status: "declined" },
        { workTitle: "Vietnamese Village", venue: "The Copper Kettle", status: "active" },
      ]),
    );
    render(<ArtistPostsPage />);
    await waitFor(() => expect(generatorProps.last?.showingAtVenueName).toBe("The Copper Kettle"));
  });

  it("a failed lookup leaves the banner off rather than crashing the studio", async () => {
    authFetchMock.mockRejectedValue(new Error("offline"));
    render(<ArtistPostsPage />);
    await waitFor(() => expect(screen.getByTestId("generator")).toBeTruthy());
    expect(generatorProps.last?.showingAtVenueName).toBeNull();
  });
});
