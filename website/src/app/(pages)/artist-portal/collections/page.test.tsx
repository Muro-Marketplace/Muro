// @vitest-environment jsdom
//
// The collection editor, covered from the size-tiers work (2026-09-05); the
// page had no test before that.
//
// A collection can optionally be sold in several sizes. Turning that on
// replaces the single price and the single per-work size list with one of each
// per tier. Turning it off puts the collection back exactly as it was.

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor, fireEvent } from "@testing-library/react";

const { mutateMock, authFetchMock, confirmMock, ApiErrorStub } = vi.hoisted(() => ({
  mutateMock: vi.fn(),
  authFetchMock: vi.fn(),
  confirmMock: vi.fn(),
  // The real module builds a Supabase client at import time, which needs env
  // this suite does not have, so api-client is replaced outright.
  ApiErrorStub: class ApiError extends Error {
    code?: string;
    constructor(message: string, code?: string) {
      super(message);
      this.code = code;
    }
  },
}));

const ARTIST = {
  id: "ap_1",
  slug: "alice",
  name: "Alice",
  works: [
    {
      id: "w-1",
      title: "Harbour Light",
      medium: "Photography",
      image: "https://example.com/1.jpg",
      pricing: [
        { label: "A4", price: 55 },
        { label: "A2", price: 160 },
      ],
    },
    {
      id: "w-2",
      title: "Low Tide",
      medium: "Photography",
      image: "https://example.com/2.jpg",
      pricing: [
        { label: "A4", price: 55 },
        { label: "50x70cm", price: 190 },
      ],
    },
  ],
};

vi.mock("@/hooks/useCurrentArtist", () => ({
  useCurrentArtist: () => ({ artist: ARTIST, loading: false }),
}));

vi.mock("@/lib/api-client", () => ({
  mutate: mutateMock,
  authFetch: authFetchMock,
  ApiError: ApiErrorStub,
}));

vi.mock("@/context/ConfirmContext", () => ({
  useConfirm: () => ({ confirm: confirmMock }),
}));

vi.mock("@/components/ArtistPortalLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/UpgradePrompt", () => ({ default: () => null }));
vi.mock("@/lib/upload", () => ({ uploadImage: vi.fn() }));

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => (
    <img src={typeof src === "string" ? src : ""} alt={alt} />
  ),
}));

import CollectionsPage from "./page";

const byText = (container: HTMLElement, tag: string, text: string) =>
  Array.from(container.querySelectorAll(tag)).find((el) =>
    (el.textContent ?? "").trim().includes(text),
  ) as HTMLElement | undefined;

const input = (container: HTMLElement, placeholder: string) =>
  container.querySelector<HTMLInputElement>(`input[placeholder*="${placeholder}"]`);

/** Open the form and pick both works, which is the minimum a collection needs. */
async function openFormWithWorks(container: HTMLElement) {
  fireEvent.click(byText(container, "button", "Create Collection")!);
  await waitFor(() => expect(input(container, "Collection name")).not.toBeNull());
  fireEvent.change(input(container, "Collection name")!, {
    target: { value: "Coastal Series" },
  });
  // A work tile is a clickable div wrapping the image, not a button. The same
  // image also appears in the thumbnail and banner pickers, so scope to the
  // works grid by its aspect-square tile.
  for (const title of ["Harbour Light", "Low Tide"]) {
    const tile = Array.from(container.querySelectorAll<HTMLImageElement>(`img[alt="${title}"]`))
      .map((img) => img.parentElement)
      .find((el) => el?.className.includes("aspect-square"));
    fireEvent.click(tile!);
  }
}

const payload = () => JSON.parse(mutateMock.mock.calls[0][1].body as string);

beforeEach(() => {
  mutateMock.mockReset();
  authFetchMock.mockReset();
  confirmMock.mockReset();
  confirmMock.mockResolvedValue(true);
  authFetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ collections: [] }),
  } as Response);
  mutateMock.mockResolvedValue({
    collection: {
      id: "alice-collection-1",
      artistSlug: "alice",
      name: "Coastal Series",
      description: "",
      bundlePrice: "120",
      workIds: ["w-1", "w-2"],
      workSizes: [],
      sizeTiers: [],
      available: true,
      createdAt: "2026-09-05T00:00:00.000Z",
    },
  });
});

afterEach(() => cleanup());

describe("the collection editor without tiers", () => {
  it("still saves a single bundle price and no tiers", async () => {
    const { container } = render(<CollectionsPage />);
    await openFormWithWorks(container);
    fireEvent.change(input(container, "Bundle price")!, { target: { value: "300" } });

    fireEvent.click(byText(container, "button", "Save Collection")!);
    await waitFor(() => expect(mutateMock).toHaveBeenCalled());
    expect(payload().bundlePrice).toBe("300");
    expect(payload().sizeTiers).toEqual([]);
  });
});

describe("the collection editor with tiers", () => {
  async function turnTiersOn(container: HTMLElement) {
    await openFormWithWorks(container);
    fireEvent.click(container.querySelector<HTMLInputElement>("input[name='tiered']")!);
    await waitFor(() => expect(input(container, "Size name")).not.toBeNull());
  }

  it("starts with one tier when switched on", async () => {
    const { container } = render(<CollectionsPage />);
    await turnTiersOn(container);
    expect(container.querySelectorAll("input[placeholder*='Size name']")).toHaveLength(1);
  });

  it("hides the single bundle price, which no longer applies", async () => {
    const { container } = render(<CollectionsPage />);
    await turnTiersOn(container);
    expect(input(container, "Bundle price")).toBeNull();
  });

  it("adds and removes tiers", async () => {
    const { container } = render(<CollectionsPage />);
    await turnTiersOn(container);

    fireEvent.click(byText(container, "button", "Add another size")!);
    expect(container.querySelectorAll("input[placeholder*='Size name']")).toHaveLength(2);

    fireEvent.click(container.querySelectorAll<HTMLElement>("[data-remove-tier]")[1]);
    expect(container.querySelectorAll("input[placeholder*='Size name']")).toHaveLength(1);
  });

  it("stops at six sizes", async () => {
    const { container } = render(<CollectionsPage />);
    await turnTiersOn(container);
    for (let i = 0; i < 8; i++) {
      const add = byText(container, "button", "Add another size");
      if (add) fireEvent.click(add);
    }
    expect(container.querySelectorAll("input[placeholder*='Size name']")).toHaveLength(6);
  });

  it("sends each tier with its own price and pinned sizes", async () => {
    const { container } = render(<CollectionsPage />);
    await turnTiersOn(container);

    fireEvent.change(container.querySelectorAll("input[placeholder*='Size name']")[0], {
      target: { value: "Small" },
    });
    fireEvent.change(container.querySelectorAll("input[placeholder*='Price']")[0], {
      target: { value: "120" },
    });

    fireEvent.click(byText(container, "button", "Save Collection")!);
    await waitFor(() => expect(mutateMock).toHaveBeenCalled());

    expect(payload().sizeTiers).toEqual([
      {
        label: "Small",
        price: "120",
        description: "",
        // Unset pickers fall back to each work's first size, the same rule the
        // untiered editor already used.
        workSizes: [
          { workId: "w-1", sizeLabel: "A4" },
          { workId: "w-2", sizeLabel: "A4" },
        ],
      },
    ]);
  });

  it("keeps each tier's pinned sizes separate", async () => {
    const { container } = render(<CollectionsPage />);
    await turnTiersOn(container);
    fireEvent.change(container.querySelectorAll("input[placeholder*='Size name']")[0], {
      target: { value: "Small" },
    });
    fireEvent.change(container.querySelectorAll("input[placeholder*='Price']")[0], {
      target: { value: "120" },
    });

    fireEvent.click(byText(container, "button", "Add another size")!);
    fireEvent.change(container.querySelectorAll("input[placeholder*='Size name']")[1], {
      target: { value: "Large" },
    });
    fireEvent.change(container.querySelectorAll("input[placeholder*='Price']")[1], {
      target: { value: "480" },
    });
    // The second tier's picker for the first work.
    const selects = container.querySelectorAll<HTMLSelectElement>("select[data-tier='1']");
    fireEvent.change(selects[0], { target: { value: "A2" } });

    fireEvent.click(byText(container, "button", "Save Collection")!);
    await waitFor(() => expect(mutateMock).toHaveBeenCalled());

    const sent = payload().sizeTiers;
    expect(sent[0].workSizes[0]).toEqual({ workId: "w-1", sizeLabel: "A4" });
    expect(sent[1].workSizes[0]).toEqual({ workId: "w-1", sizeLabel: "A2" });
  });

  it("refuses to save a tier with no name", async () => {
    const { container } = render(<CollectionsPage />);
    await turnTiersOn(container);
    fireEvent.change(container.querySelectorAll("input[placeholder*='Price']")[0], {
      target: { value: "120" },
    });

    fireEvent.click(byText(container, "button", "Save Collection")!);
    await waitFor(() =>
      expect(container.textContent).toContain("Give every size a name and a price"),
    );
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("refuses to save a tier with no price", async () => {
    const { container } = render(<CollectionsPage />);
    await turnTiersOn(container);
    fireEvent.change(container.querySelectorAll("input[placeholder*='Size name']")[0], {
      target: { value: "Small" },
    });

    fireEvent.click(byText(container, "button", "Save Collection")!);
    await waitFor(() =>
      expect(container.textContent).toContain("Give every size a name and a price"),
    );
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("refuses two sizes sharing a name, which the server would reject anyway", async () => {
    const { container } = render(<CollectionsPage />);
    await turnTiersOn(container);
    fireEvent.change(container.querySelectorAll("input[placeholder*='Size name']")[0], {
      target: { value: "Small" },
    });
    fireEvent.change(container.querySelectorAll("input[placeholder*='Price']")[0], {
      target: { value: "120" },
    });
    fireEvent.click(byText(container, "button", "Add another size")!);
    fireEvent.change(container.querySelectorAll("input[placeholder*='Size name']")[1], {
      target: { value: "small" },
    });
    fireEvent.change(container.querySelectorAll("input[placeholder*='Price']")[1], {
      target: { value: "480" },
    });

    fireEvent.click(byText(container, "button", "Save Collection")!);
    await waitFor(() => expect(container.textContent).toContain("Two sizes have the same name"));
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("does not send a bundle price, leaving it to the database trigger", async () => {
    const { container } = render(<CollectionsPage />);
    await turnTiersOn(container);
    fireEvent.change(container.querySelectorAll("input[placeholder*='Size name']")[0], {
      target: { value: "Small" },
    });
    fireEvent.change(container.querySelectorAll("input[placeholder*='Price']")[0], {
      target: { value: "120" },
    });

    fireEvent.click(byText(container, "button", "Save Collection")!);
    await waitFor(() => expect(mutateMock).toHaveBeenCalled());
    expect(payload().bundlePrice).toBe("");
  });

  it("warns before publishing a tier that costs more than its parts", async () => {
    // The untiered editor already blocks this; the check has to run per tier,
    // or the cheapest tier alone could vouch for an overpriced one.
    const { container } = render(<CollectionsPage />);
    await turnTiersOn(container);
    fireEvent.change(container.querySelectorAll("input[placeholder*='Size name']")[0], {
      target: { value: "Small" },
    });
    // Both works at A4 come to £110, so £400 is well over the sum.
    fireEvent.change(container.querySelectorAll("input[placeholder*='Price']")[0], {
      target: { value: "400" },
    });

    fireEvent.click(byText(container, "button", "Save Collection")!);
    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    expect(confirmMock.mock.calls[0][0].body).toContain("Small");
  });
});
