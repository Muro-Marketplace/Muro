// @vitest-environment jsdom
//
// Regression test for B13: collection work tiles and their Open buttons used
// to link /browse/<artist>/<work.id>, but the artwork route resolves works by
// slugify(title) only, so every DB-backed tile (whose id is a UUID) 404ed.
// The links must be built from the slugified title instead.

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor, fireEvent } from "@testing-library/react";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ collectionId: "col-1" }),
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={typeof src === "string" ? src : ""} alt={alt} />,
}));

vi.mock("@/context/CartContext", () => ({
  useCart: () => ({ addItem: vi.fn() }),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: null, userType: null, loading: false }),
}));

// Presentational neighbours with their own context/network dependencies.
vi.mock("@/components/Breadcrumbs", () => ({ default: () => null }));
vi.mock("@/components/SaveButton", () => ({ default: () => null }));
vi.mock("@/components/offers/MakeOfferModal", () => ({ default: () => null }));

import CollectionDetailPage from "./page";

// A DB-backed work: UUID id, title that slugifies differently from the id.
const WORK = {
  id: "3f2a9c44-1b7e-4f7a-9f2f-9a1d2e3c4b5a",
  title: "Study in Blue No. 7",
  image: "https://example.com/w.jpg",
  medium: "Oil on canvas",
  dimensions: "50 x 70 cm",
  available: true,
  selectedSize: "A2",
  selectedSizePrice: 150,
  pricing: [],
};

const COLLECTION = {
  id: "col-1",
  artistSlug: "maya-chen",
  artistName: "Maya Chen",
  name: "Coastal Series",
  description: "",
  coverImage: "https://example.com/c.jpg",
  bannerImage: "https://example.com/b.jpg",
  thumbnail: "https://example.com/t.jpg",
  workIds: [WORK.id],
  bundlePrice: 500,
  bundlePriceBand: "£500",
  available: true,
};

const fetchMock = vi.fn();

beforeEach(() => {
  push.mockClear();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ collection: COLLECTION, works: [WORK], artistArrangements: null }),
  } as Response);
  vi.stubGlobal("fetch", fetchMock);
  // Desktop pointer: hover available, so a card click navigates directly
  // instead of doing the touch tap-to-reveal step.
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({ matches: true, addListener: vi.fn(), removeListener: vi.fn() }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Collection work tiles link by slugified title (B13)", () => {
  it("builds the Open link from slugify(title), not the DB UUID", async () => {
    const { container } = render(<CollectionDetailPage />);

    await waitFor(() => {
      expect(container.textContent).toContain("Coastal Series");
    });

    const openLink = Array.from(container.querySelectorAll("a")).find(
      (a) => a.textContent === "Open",
    );
    expect(openLink).toBeDefined();
    expect(openLink!.getAttribute("href")).toBe("/browse/maya-chen/study-in-blue-no-7");

    // The UUID must not appear in any navigation href.
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.some((h) => h.includes(WORK.id))).toBe(false);
  });

  it("navigates to the slugified URL when the card itself is clicked", async () => {
    const { container } = render(<CollectionDetailPage />);

    await waitFor(() => {
      expect(container.textContent).toContain("Coastal Series");
    });

    const card = container.querySelector<HTMLElement>(".group.relative.rounded-sm");
    expect(card).not.toBeNull();
    fireEvent.click(card!);

    expect(push).toHaveBeenCalledWith("/browse/maya-chen/study-in-blue-no-7");
  });
});
