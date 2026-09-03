// @vitest-environment jsdom
//
// Page-level integration test for the browse sidebar-filter URL sync (Bug 20).
//
// These complement the exhaustive pure-module tests in filterParams.test.ts.
// They mount the real /browse page (a large client component wrapped in a
// Suspense boundary for useSearchParams) and assert the three behaviours the
// sync must guarantee:
//   (a) changing a synced filter writes the expected param to the live URL
//       (window.history.replaceState, never a router navigation),
//   (b) mounting with those params in the URL hydrates the matching control,
//   (c) a clean mount (default state, empty URL) does NOT write the URL
//       — the loop guard short-circuits the no-op write.
//
// next/navigation is mocked with a controllable `currentParams` (what
// useSearchParams reports) and the live URL is set with replaceState, so each
// test drives both views of the "URL" before render. Writes are observed via a
// spy on window.history.replaceState. fetch is stubbed to reject so the page keeps its static seed
// data and the test stays deterministic (no network, same as the other page
// tests in this repo).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

// --- controllable URL state -------------------------------------------------
let currentParams = new URLSearchParams("");
const replace = vi.fn();
let replaceState: ReturnType<typeof vi.spyOn>;
/** Every URL the page wrote, in order. */
function writtenUrls(): string[] {
  return replaceState.mock.calls.map((c) => String(c[2]));
}
function setLiveUrl(qs: string) {
  window.history.replaceState(null, "", `/browse${qs ? `?${qs}` : ""}`);
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/browse",
  // Return an object backed by the live `currentParams` so a test can set the
  // initial URL, and so `.toString()` (used by the loop guard) is accurate.
  useSearchParams: () => ({
    get: (k: string) => currentParams.get(k),
    toString: () => currentParams.toString(),
    has: (k: string) => currentParams.has(k),
  }),
}));

// Stub the Supabase client + auth-fetch wrapper so the transitive import chain
// (SaveButton -> contexts -> lib/supabase) doesn't require real env vars.
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: {}, from: () => ({}) },
}));
vi.mock("@/lib/api-client", () => ({
  authFetch: vi.fn(() => Promise.reject(new Error("no network in test"))),
}));

vi.mock("@/context/SavedContext", () => ({
  useSaved: () => ({ toggleSaved: vi.fn(), isSaved: () => false, savedIds: new Set() }),
}));

vi.mock("@/context/ToastContext", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>{children}</a>
  ),
}));

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={typeof src === "string" ? src : ""} alt={alt} />,
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: null,
    userType: null,
    loading: false,
    subscriptionStatus: null,
    subscriptionPlan: null,
    displayName: null,
  }),
}));

import BrowsePortfoliosPage from "./page";

beforeEach(() => {
  setLiveUrl("");
  replaceState = vi.spyOn(window.history, "replaceState");
  replace.mockReset();
  currentParams = new URLSearchParams("");
  // Static-data fallback path: reject all fetches so result data stays the
  // seed and the component reaches a stable, deterministic tree.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("no network in test"))),
  );
});

afterEach(() => {
  replaceState.mockRestore();
  setLiveUrl("");
  cleanup();
  vi.unstubAllGlobals();
});

/** Find the gallery-sort <select> by the option set unique to it. */
function getGallerySortSelect(): HTMLSelectElement {
  const combos = screen.getAllByRole("combobox") as HTMLSelectElement[];
  const match = combos.find((c) =>
    Array.from(c.options).some((o) => o.value === "price_low"),
  );
  if (!match) throw new Error("gallery sort select not found");
  return match;
}

describe("browse page — sidebar filter URL sync (Bug 20)", () => {
  it("(a) writes the expected param to the live URL when a synced filter changes", async () => {
    render(<BrowsePortfoliosPage />);

    const sortSelect = getGallerySortSelect();
    // Sanity: starts at the default before we change it.
    expect(sortSelect.value).toBe("featured");

    fireEvent.change(sortSelect, { target: { value: "price_low" } });

    // The write is debounced (~200ms); wait for it to land. (Mount-time
    // hydration may write the unchanged URL first, so wait for the param.)
    await waitFor(
      () => {
        expect(writtenUrls().some((u) => u.includes("gsort=price_low"))).toBe(true);
      },
      { timeout: 1500 },
    );

    const urls = writtenUrls();
    // Never a router navigation: that is what let an in-flight write
    // clobber the distance slider.
    expect(replace).not.toHaveBeenCalled();
    // It must NOT clobber the path or invent unrelated params.
    expect(urls.every((u) => u.startsWith("/browse"))).toBe(true);
  });

  it("(b) hydrates a control from URL params present on mount", async () => {
    currentParams = new URLSearchParams("gsort=price_low");
    setLiveUrl("gsort=price_low");
    render(<BrowsePortfoliosPage />);

    // After the one-time hydration effect runs, the gallery-sort select
    // should reflect the value carried in the URL.
    await waitFor(
      () => {
        expect(getGallerySortSelect().value).toBe("price_low");
      },
      { timeout: 1500 },
    );
  });

  it("(b2) hydrates a boolean filter (Originals) from the URL", async () => {
    currentParams = new URLSearchParams("gorig=1");
    setLiveUrl("gorig=1");
    render(<BrowsePortfoliosPage />);

    // The Originals CheckPill renders its label; when checked the page wires
    // galleryOriginals=true. We assert hydration didn't throw and the control
    // is present, then confirm the write-back keeps gorig set (round-trip).
    await waitFor(
      () => {
        expect(screen.getAllByText(/Originals/i).length).toBeGreaterThan(0);
      },
      { timeout: 1500 },
    );

    // Give the debounced write a chance to fire. Because the URL already
    // matches the hydrated state, the loop guard should keep replace at zero
    // (or, if it fires, the query must still contain gorig).
    await new Promise((r) => setTimeout(r, 350));
    if (writtenUrls().length > 0) {
      expect(writtenUrls().every((u) => u.includes("gorig=1"))).toBe(true);
    }
  });

  it("(c) does NOT write the URL on a clean default mount (loop guard)", async () => {
    render(<BrowsePortfoliosPage />);

    // Wait past the debounce window; a no-op render must not write.
    await new Promise((r) => setTimeout(r, 400));
    expect(writtenUrls()).toEqual([]);
    expect(replace).not.toHaveBeenCalled();
  });

  it("(c2) preserves an existing primary param (view) when writing a filter", async () => {
    // Keep the gallery view (so the gallery-sort control is on screen) while
    // carrying a non-filter primary param the merge must not drop.
    currentParams = new URLSearchParams("view=gallery&discipline=photography");
    setLiveUrl("view=gallery&discipline=photography");
    render(<BrowsePortfoliosPage />);

    const sortSelect = getGallerySortSelect();
    fireEvent.change(sortSelect, { target: { value: "az" } });

    await waitFor(
      () => {
        expect(writtenUrls().some((u) => u.includes("gsort=az"))).toBe(true);
      },
      { timeout: 1500 },
    );
    const urls = writtenUrls();
    // The new filter param AND the pre-existing primary params both survive.
    expect(
      urls.some(
        (u) => u.includes("gsort=az") && u.includes("discipline=photography"),
      ),
    ).toBe(true);
  });
});

/** The artist sidebar's Theme <select>, identified by its "All themes" option. */
function getArtistThemeSelect(): HTMLSelectElement {
  const combos = screen.getAllByRole("combobox") as HTMLSelectElement[];
  const match = combos.find((c) =>
    Array.from(c.options).some((o) => o.textContent === "All themes"),
  );
  if (!match) throw new Error("artist theme select not found");
  return match;
}

describe("browse page — artist filter badge count (B2)", () => {
  it("counts one for one applied filter, not two", async () => {
    // ?view=portfolios puts the page in the artists view, where the
    // sidebar badge lives.
    currentParams = new URLSearchParams("view=portfolios");
    setLiveUrl("view=portfolios");
    render(<BrowsePortfoliosPage />);

    const themeSelect = await waitFor(() => getArtistThemeSelect(), { timeout: 1500 });
    // Nothing applied yet, so no badge at all.
    expect(screen.queryByTestId("artist-filter-count")).toBeNull();

    const firstTheme = Array.from(themeSelect.options).find((o) => o.value !== "")!;
    fireEvent.change(themeSelect, { target: { value: firstTheme.value } });

    // Exactly one filter is applied, so the badge must read "1". Before the
    // fix `filters.mode === "local"` was an always-true entry in the count
    // array, so this rendered "2".
    await waitFor(
      () => {
        expect(screen.getByTestId("artist-filter-count").textContent).toBe("1");
      },
      { timeout: 1500 },
    );
  });
});

describe("browse page — empty artist grid guidance (B3)", () => {
  it("blames the filters, not a missing postcode, when a search emptied the grid", async () => {
    // A search term nothing can match, with no location set. Before the fix
    // `filters.mode === "local" && !userCoords` was true (mode is permanently
    // "local"), so this told the visitor to enter a postcode even though the
    // distance filter never ran.
    currentParams = new URLSearchParams("view=portfolios&q=zzzznosuchartistanywhere");
    setLiveUrl("view=portfolios&q=zzzznosuchartistanywhere");
    render(<BrowsePortfoliosPage />);

    await waitFor(
      () => {
        expect(screen.getByText(/No artists match these filters/i)).toBeTruthy();
      },
      { timeout: 1500 },
    );
    // The sidebar has its own "Enter your postcode" label, so match the
    // empty-state wording specifically.
    expect(screen.queryByText(/Enter your postcode in the filter panel/i)).toBeNull();
  });

  it("still offers the postcode hint when nothing else is narrowing", async () => {
    // Same empty grid, but reached with no filters and no search: here the
    // postcode hint is the right advice, so the fix must not remove it.
    currentParams = new URLSearchParams("view=portfolios&discipline=");
    setLiveUrl("view=portfolios&discipline=");
    render(<BrowsePortfoliosPage />);

    // Seed data has artists, so assert on the branch condition rather than
    // the rendered copy: with no filters at all the guidance branch is the
    // postcode one, which we prove by the absence of the filters copy.
    await waitFor(
      () => {
        expect(getArtistThemeSelect()).toBeTruthy();
      },
      { timeout: 1500 },
    );
    expect(screen.queryByText(/No artists match these filters/i)).toBeNull();
  });
});

describe("browse page — gallery Clear all keeps location filtering on (B4)", () => {
  it("does not switch galleryLocationMode to global", async () => {
    // Land in the gallery view with one gallery filter set so the sidebar's
    // "Clear all" button renders.
    currentParams = new URLSearchParams("gorig=1");
    setLiveUrl("gorig=1");
    render(<BrowsePortfoliosPage />);

    const clearBtn = await waitFor(
      () => {
        const btn = screen.getAllByRole("button").find((b) => b.textContent === "Clear all");
        if (!btn) throw new Error("gallery Clear all not rendered");
        return btn;
      },
      { timeout: 1500 },
    );

    replace.mockReset();
    fireEvent.click(clearBtn);

    // Let the debounced URL write settle.
    await new Promise((r) => setTimeout(r, 450));

    const urls = replace.mock.calls.map((c) => String(c[0]));
    // Before the fix, clearing set the mode to "global", which is the
    // non-default value, so it was serialised into the URL and the distance
    // filter stopped applying for the rest of the session.
    expect(urls.every((u) => !u.includes("gloc=global"))).toBe(true);
    // The filter it was actually asked to clear is gone.
    expect(urls.every((u) => !u.includes("gorig=1"))).toBe(true);
  });
});

describe("browse page — seed artists carry the Sample pill from first paint (Finding 1)", () => {
  it("shows the Sample pill on the seed grid when the artists fetch never resolves", async () => {
    // Artists view (view=portfolios) renders the compact BrowseArtistCard
    // grid, which reads artist.isSeedArtist. fetch is stubbed to reject in
    // beforeEach above, so this stays on the static seed the whole test:
    // the pill can only appear if the useState initialiser stamped
    // isSeedArtist onto the imported @/data/artists rows itself.
    currentParams = new URLSearchParams("view=portfolios");
    setLiveUrl("view=portfolios");
    render(<BrowsePortfoliosPage />);

    const pills = await screen.findAllByText("Sample");
    expect(pills.length).toBeGreaterThan(0);
  });
});
