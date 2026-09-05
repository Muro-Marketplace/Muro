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
import { ARRANGEMENT_LABEL } from "@/lib/arrangement-labels";

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

describe("Collection arrangement chips use the shared labels (B15)", () => {
  const ARRANGEMENTS = {
    openToFreeLoan: true,
    openToRevenueShare: true,
    revenueSharePercent: 30,
    openToOutrightPurchase: true,
  };

  beforeEach(() => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        collection: COLLECTION,
        works: [WORK],
        artistArrangements: ARRANGEMENTS,
      }),
    } as Response);
  });

  it("labels the openToFreeLoan flag as a paid loan, never 'Display'", async () => {
    const { container } = render(<CollectionDetailPage />);

    await waitFor(() => {
      expect(container.textContent).toContain("Coastal Series");
    });

    // `openToFreeLoan` is the legacy alias for a PAID loan (K3), and the
    // browse artist cards render it as ARRANGEMENT_LABEL.paid_loan. This
    // page said "Display", which reads as free.
    expect(container.textContent).toContain(ARRANGEMENT_LABEL.paid_loan);
    const chips = Array.from(container.querySelectorAll("span")).map((s) => s.textContent);
    expect(chips).not.toContain("Display");
  });

  it("uses the shared vocabulary for the other two chips too", async () => {
    const { container } = render(<CollectionDetailPage />);

    await waitFor(() => {
      expect(container.textContent).toContain("Coastal Series");
    });

    expect(container.textContent).toContain(`${ARRANGEMENT_LABEL.revenue_share} · 30%`);
    expect(container.textContent).toContain(ARRANGEMENT_LABEL.purchase);
    const chips = Array.from(container.querySelectorAll("span")).map((s) => s.textContent);
    expect(chips).not.toContain("Rev share · 30%");
    expect(chips).not.toContain("Purchase");
  });
});

// ── Size tiers (2026-09-05) ─────────────────────────────────────────────────
//
// A collection can be sold in several sizes. Picking one has to move the
// headline price, the savings line, the buy button and the size and price on
// every work tile together, because the tier IS the product being bought.
//
// Per-tier work prices are resolved on the client from each work's own
// `pricing` array, which the detail API already returns in full, so switching
// tiers costs no round trip.
describe("Collection size tiers", () => {
  const TIER_WORKS = [
    {
      id: "w-1",
      title: "Harbour Light",
      image: "https://example.com/1.jpg",
      medium: "Photography",
      dimensions: "30 x 40 cm",
      available: true,
      selectedSize: "A4",
      selectedSizePrice: 55,
      pricing: [
        { label: "A4", price: 55 },
        { label: "A2", price: 160 },
      ],
    },
    {
      id: "w-2",
      title: "Low Tide",
      image: "https://example.com/2.jpg",
      medium: "Photography",
      dimensions: "30 x 40 cm",
      available: true,
      selectedSize: "A4",
      selectedSizePrice: 55,
      pricing: [
        { label: "A4", price: 55 },
        { label: "50x70cm", price: 190 },
      ],
    },
  ];

  const TIERED = {
    ...COLLECTION,
    workIds: ["w-1", "w-2"],
    bundlePrice: 120,
    bundlePriceBand: "From £120",
    sizeTiers: [
      {
        label: "Small",
        price: 120,
        description: "A4 prints",
        workSizes: [
          { workId: "w-1", sizeLabel: "A4" },
          { workId: "w-2", sizeLabel: "A4" },
        ],
      },
      {
        label: "Large",
        price: 480,
        workSizes: [
          { workId: "w-1", sizeLabel: "A2" },
          { workId: "w-2", sizeLabel: "50x70cm" },
        ],
      },
    ],
  };

  const addItem = vi.fn();

  function mountTiered(collection: unknown = TIERED) {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ collection, works: TIER_WORKS, artistArrangements: null }),
    } as Response);
    return render(<CollectionDetailPage />);
  }

  const tierButton = (container: HTMLElement, label: string) =>
    Array.from(container.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes(label),
    );

  beforeEach(() => {
    addItem.mockClear();
  });

  it("renders no size picker when the collection has no tiers", async () => {
    const { container } = mountTiered({ ...COLLECTION, sizeTiers: [] });
    await waitFor(() => expect(container.textContent).toContain("Coastal Series"));
    expect(container.textContent).not.toContain("Choose a size");
  });

  it("renders one option per tier", async () => {
    const { container } = mountTiered();
    await waitFor(() => expect(container.textContent).toContain("Choose a size"));
    expect(tierButton(container, "Small")).toBeDefined();
    expect(tierButton(container, "Large")).toBeDefined();
  });

  it("opens on the cheapest tier", async () => {
    const { container } = mountTiered();
    await waitFor(() => expect(container.textContent).toContain("Choose a size"));
    expect(tierButton(container, "Small")!.getAttribute("aria-pressed")).toBe("true");
    expect(tierButton(container, "Large")!.getAttribute("aria-pressed")).toBe("false");
  });

  it("moves the headline price when another tier is picked", async () => {
    const { container } = mountTiered();
    await waitFor(() => expect(container.textContent).toContain("Choose a size"));
    expect(container.textContent).toContain("£120");

    fireEvent.click(tierButton(container, "Large")!);
    expect(container.textContent).toContain("£480");
    expect(tierButton(container, "Large")!.getAttribute("aria-pressed")).toBe("true");
  });

  it("moves each work's size and price with the tier", async () => {
    const { container } = mountTiered();
    await waitFor(() => expect(container.textContent).toContain("Choose a size"));
    expect(container.textContent).toContain("A4");

    fireEvent.click(tierButton(container, "Large")!);
    expect(container.textContent).toContain("A2");
    expect(container.textContent).toContain("50x70cm");
    expect(container.textContent).not.toContain("A4 ");
  });

  it("recomputes the saving against the selected tier", async () => {
    // Large: the works cost 160 + 190 = 350 individually, against a 480 tier,
    // so there is no saving to claim and the line must not appear.
    const { container } = mountTiered();
    await waitFor(() => expect(container.textContent).toContain("Choose a size"));
    // Small: 55 + 55 = 110 against a 120 tier, also no saving.
    expect(container.textContent).not.toContain("Save ");

    fireEvent.click(tierButton(container, "Large")!);
    expect(container.textContent).not.toContain("Save ");
  });

  it("shows a saving when the tier really is cheaper than its parts", async () => {
    const { container } = mountTiered({
      ...TIERED,
      sizeTiers: [
        { ...TIERED.sizeTiers[0], price: 90 },
        TIERED.sizeTiers[1],
      ],
    });
    await waitFor(() => expect(container.textContent).toContain("Choose a size"));
    // 55 + 55 = 110 individually, against a 90 tier.
    expect(container.textContent).toContain("Save £20");
  });

  it("shows the tier's own description when it has one", async () => {
    const { container } = mountTiered();
    await waitFor(() => expect(container.textContent).toContain("Choose a size"));
    expect(container.textContent).toContain("A4 prints");
  });
});
