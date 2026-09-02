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
  artistState: { works: [] as unknown[], subscriptionPlan: undefined as string | undefined },
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
  useCurrentArtist: () => ({
    artist: { slug: "alice", name: "Alice", works: artistState.works, subscriptionPlan: artistState.subscriptionPlan },
    loading: false,
  }),
}));

import PortfolioPage from "./page";
import { ApiError } from "@/lib/api-client";

// jsdom neither loads images nor implements object URLs, and the upload path
// awaits window.Image's onload before it calls uploadImage. Stub both so the
// D22/D24 tests can drive a real file-input change end to end.
class FakeImage {
  naturalWidth = 900;
  naturalHeight = 600;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_v: string) {
    setTimeout(() => this.onload?.(), 0);
  }
}
URL.createObjectURL = vi.fn(() => "blob:mock");
URL.revokeObjectURL = vi.fn();

afterEach(() => cleanup());
beforeEach(() => {
  mutateMock.mockReset();
  showToastMock.mockReset();
  artistState.works = [];
  artistState.subscriptionPlan = undefined;
  vi.stubGlobal("Image", FakeImage);
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

/** Open the Add form and fill the fields handleSubmit requires. */
async function openAddAndFill({ withImage = true }: { withImage?: boolean } = {}) {
  fireEvent.click(screen.getAllByText("+ Add New Work")[0]);
  fireEvent.change(screen.getAllByPlaceholderText(TITLE_PLACEHOLDER)[0], {
    target: { value: "Test Work" },
  });
  // defaultSizes already gives one labelled size row at price 0; give it a price.
  fireEvent.change(screen.getAllByPlaceholderText("Price")[0], { target: { value: "120" } });
  if (!withImage) return;
  // D22: an image is required before a work can save. Push one through the
  // primary file input (the mocked uploadImage resolves to https://cdn/x.png)
  // and wait for the preview state ("Replace Image") to confirm it landed.
  const fileInput = document.querySelector(
    'input[type="file"]:not([multiple])',
  ) as HTMLInputElement;
  fireEvent.change(fileInput, {
    target: { files: [new File(["x"], "art.png", { type: "image/png" })] },
  });
  await screen.findAllByText("Replace Image");
}

describe("artist portfolio add/edit save (E41-a)", () => {
  it("keeps the form open and shows the real error when the write fails, with no success toast", async () => {
    mutateMock.mockRejectedValue(new ApiError(403, "post_limit_reached", "post_limit_reached", {}));
    render(<PortfolioPage />);

    await openAddAndFill();
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

    await openAddAndFill();
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

    await openAddAndFill();
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

// D22. Saving a work without an image used to fall back to a picsum stock
// photo, which then went live on public browse as if it were the artwork.
describe("imageless works cannot save (D22)", () => {
  it("refuses to save without an image and shows a validation message", async () => {
    mutateMock.mockResolvedValue({ savedRow: { id: "w1" } });
    render(<PortfolioPage />);

    await openAddAndFill({ withImage: false });
    fireEvent.click(screen.getAllByText("Save Work")[0]);

    // Fail-before: the save went through with a picsum placeholder as the image.
    expect(
      (await screen.findAllByText("Upload an image of the artwork before saving")).length,
    ).toBeGreaterThan(0);
    expect(mutateMock).not.toHaveBeenCalled();
    expect(showToastMock).not.toHaveBeenCalledWith("Artwork added");
    expect(formIsOpen()).toBe(true);
  });

  it("publishes the uploaded image, never a stock placeholder", async () => {
    mutateMock.mockResolvedValue({ savedRow: { id: "w1" } });
    render(<PortfolioPage />);

    await openAddAndFill();
    fireEvent.click(screen.getAllByText("Save Work")[0]);

    await waitFor(() => expect(showToastMock).toHaveBeenCalledWith("Artwork added"));
    const body = JSON.parse(
      (mutateMock.mock.calls[0][1] as { body: string }).body,
    ) as { image: string };
    expect(body.image).toBe("https://cdn/x.png");
    expect(JSON.stringify(mutateMock.mock.calls)).not.toContain("picsum");
  });
});

// D24. Bulk add used to filter to the valid drafts, save those, and clear the
// whole list, silently discarding every incomplete draft (typed titles and
// uploaded images included) with only an "Added N works" toast.
describe("bulk add keeps incomplete drafts (D24)", () => {
  it("saves the complete drafts and keeps the incomplete ones in the editor with a message", async () => {
    mutateMock.mockResolvedValue({});
    render(<PortfolioPage />);

    // No works yet, so the empty state's "Bulk add multiple" opens the modal.
    fireEvent.click(screen.getAllByText("Bulk add multiple")[0]);
    const bulkInput = document.querySelector(
      'input[type="file"][multiple]',
    ) as HTMLInputElement;
    fireEvent.change(bulkInput, {
      target: {
        files: [
          new File(["a"], "ready.png", { type: "image/png" }),
          new File(["b"], "incomplete.png", { type: "image/png" }),
        ],
      },
    });

    // Titles are seeded from the filenames; wait for both uploads to settle.
    await screen.findByDisplayValue("ready");
    await screen.findByDisplayValue("incomplete");
    await waitFor(() => expect(screen.queryAllByText("Uploading…")).toHaveLength(0));

    // Price the first draft only; the second stays unpriced and so invalid.
    fireEvent.change(screen.getAllByPlaceholderText("0")[0], { target: { value: "120" } });

    fireEvent.click(screen.getByText("Save 2 works"));

    await waitFor(() => expect(showToastMock).toHaveBeenCalledWith("Added 1 work"));
    // Fail-before: setBulkAddDrafts([]) wiped the incomplete draft here. It now
    // stays in the editor, while the saved draft leaves.
    expect(screen.getByDisplayValue("incomplete")).toBeTruthy();
    expect(screen.queryByDisplayValue("ready")).toBeNull();
    // And the artist is told what happened, per draft and overall.
    expect(
      screen.getByText("1 draft was not saved. Fix the highlighted issues, then save again."),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "This draft needs at least one size with a price above £0 before it can be saved.",
      ),
    ).toBeTruthy();
  });

  it("saves nothing and flags every draft when none are complete", async () => {
    mutateMock.mockResolvedValue({});
    render(<PortfolioPage />);

    fireEvent.click(screen.getAllByText("Bulk add multiple")[0]);
    const bulkInput = document.querySelector(
      'input[type="file"][multiple]',
    ) as HTMLInputElement;
    fireEvent.change(bulkInput, {
      target: { files: [new File(["a"], "unpriced.png", { type: "image/png" })] },
    });
    await screen.findByDisplayValue("unpriced");
    await waitFor(() => expect(screen.queryAllByText("Uploading…")).toHaveLength(0));

    fireEvent.click(screen.getByText("Save 1 work"));

    expect(
      await screen.findByText(
        "Nothing was saved. Each draft needs an image, a title, and at least one priced size.",
      ),
    ).toBeTruthy();
    expect(screen.getByDisplayValue("unpriced")).toBeTruthy();
    expect(showToastMock).not.toHaveBeenCalled();
  });
});

// D23. Five bulk paths (reorder, bulk availability, bulk add, bulk prices,
// copy-from) all went through a fire-and-forget saveWorks that swallowed the
// rejection into console.error while the caller toasted success on the next
// line. They now share an awaited save control, so a rejected POST rolls the
// grid back and shows the server's real message instead of "done".
describe("bulk portfolio actions report the truth (D23)", () => {
  async function enterSelectModeAndPick(title: string) {
    fireEvent.click(await screen.findByText("Select multiple"));
    fireEvent.click((await screen.findAllByText(title))[0]);
  }

  it("a rejected bulk availability change rolls back and shows the error", async () => {
    mutateMock.mockRejectedValue(new ApiError(500, "Server error", "server_error", {}));
    artistState.works = [{ ...WORK, available: true }];
    render(<PortfolioPage />);
    await screen.findAllByText("My Work");

    await enterSelectModeAndPick("My Work");
    fireEvent.click(await screen.findByText("Mark sold"));

    await waitFor(() => expect(errorToastFired()).toBe(true));
    // Never claims success on a write the server refused.
    expect(showToastMock.mock.calls.some((c) => String(c[0]).startsWith("Marked 1 work"))).toBe(false);
  });

  it("a confirmed bulk availability change toasts success once", async () => {
    mutateMock.mockResolvedValue({ ok: true });
    artistState.works = [{ ...WORK, available: true }];
    render(<PortfolioPage />);
    await screen.findAllByText("My Work");

    await enterSelectModeAndPick("My Work");
    fireEvent.click(await screen.findByText("Mark sold"));

    await waitFor(() =>
      expect(showToastMock.mock.calls.some((c) => String(c[0]) === "Marked 1 work as sold")).toBe(true),
    );
    expect(errorToastFired()).toBe(false);
  });
});

// Owner decision 2026-09-02: Premium and Pro artists can push one artwork to
// the top of the marketplace gallery for seven days. The POST goes through
// mutate() (not authFetch), matching the rest of this file: mutate() throws
// ApiError on a non-2xx instead of resolving into a silent false-success (the
// exact defect the wallplace/no-authfetch-mutation rule guards against).
describe("Artwork of the Week control (owner decision 2 September)", () => {
  it("offers Feature for a week to a Premium artist and posts to the feature endpoint", async () => {
    artistState.subscriptionPlan = "premium";
    artistState.works = [WORK];
    mutateMock.mockResolvedValue({ featuredUntil: "2026-09-09T12:00:00.000Z" });
    render(<PortfolioPage />);

    fireEvent.mouseOver(await screen.findByText(WORK.title));
    fireEvent.click(screen.getByRole("button", { name: /feature for a week/i }));

    await waitFor(() =>
      expect(mutateMock).toHaveBeenCalledWith(
        `/api/artist-works/${WORK.id}/feature`,
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(await screen.findByText(/featured until/i)).toBeTruthy();
  });

  it("tells a Core artist it is a Premium and Pro perk", async () => {
    artistState.subscriptionPlan = "core";
    artistState.works = [WORK];
    render(<PortfolioPage />);

    fireEvent.mouseOver(await screen.findByText(WORK.title));
    const btn = screen.getByRole("button", { name: /feature for a week/i });

    expect(btn.getAttribute("title")).toMatch(/premium and pro/i);
    expect(btn.hasAttribute("disabled")).toBe(true);
  });

  it("shows the server's error text when the feature endpoint refuses", async () => {
    artistState.subscriptionPlan = "premium";
    artistState.works = [WORK];
    mutateMock.mockRejectedValue(
      new ApiError(409, "You already have an Artwork of the Week running.", "boost_live", {}),
    );
    render(<PortfolioPage />);

    fireEvent.mouseOver(await screen.findByText(WORK.title));
    fireEvent.click(screen.getByRole("button", { name: /feature for a week/i }));

    await waitFor(() =>
      expect(showToastMock).toHaveBeenCalledWith(
        "You already have an Artwork of the Week running.",
        expect.objectContaining({ variant: "error" }),
      ),
    );
    // A refused boost must not mark the work as featured.
    expect(screen.queryByText(/featured until/i)).toBeNull();
  });
});
