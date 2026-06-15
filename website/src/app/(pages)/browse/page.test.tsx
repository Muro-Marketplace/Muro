// @vitest-environment jsdom
//
// Page-level integration test for the browse sidebar-filter URL sync (Bug 20).
//
// These complement the exhaustive pure-module tests in filterParams.test.ts.
// They mount the real /browse page (a large client component wrapped in a
// Suspense boundary for useSearchParams) and assert the three behaviours the
// sync must guarantee:
//   (a) changing a synced filter writes the expected param via router.replace,
//   (b) mounting with those params in the URL hydrates the matching control,
//   (c) a clean mount (default state, empty URL) does NOT call router.replace
//       — the loop guard short-circuits the no-op write.
//
// next/navigation is mocked with a mutable `replace` spy and a controllable
// `currentParams`, so each test drives the "URL" by swapping that object
// before render. fetch is stubbed to reject so the page keeps its static seed
// data and the test stays deterministic (no network, same as the other page
// tests in this repo).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

// --- controllable URL state -------------------------------------------------
let currentParams = new URLSearchParams("");
const replace = vi.fn();

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
  it("(a) writes the expected param via router.replace when a synced filter changes", async () => {
    render(<BrowsePortfoliosPage />);

    const sortSelect = getGallerySortSelect();
    // Sanity: starts at the default before we change it.
    expect(sortSelect.value).toBe("featured");

    fireEvent.change(sortSelect, { target: { value: "price_low" } });

    // The write is debounced (~200ms); wait for the replace to land.
    await waitFor(
      () => {
        expect(replace).toHaveBeenCalled();
      },
      { timeout: 1500 },
    );

    const urls = replace.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("gsort=price_low"))).toBe(true);
    // It must NOT clobber the path or invent unrelated params.
    expect(urls.every((u) => u.startsWith("/browse"))).toBe(true);
  });

  it("(b) hydrates a control from URL params present on mount", async () => {
    currentParams = new URLSearchParams("gsort=price_low");
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
    if (replace.mock.calls.length > 0) {
      const urls = replace.mock.calls.map((c) => String(c[0]));
      expect(urls.every((u) => u.includes("gorig=1"))).toBe(true);
    }
  });

  it("(c) does NOT call router.replace on a clean default mount (loop guard)", async () => {
    render(<BrowsePortfoliosPage />);

    // Wait past the debounce window; a no-op render must not write.
    await new Promise((r) => setTimeout(r, 400));
    expect(replace).not.toHaveBeenCalled();
  });

  it("(c2) preserves an existing primary param (view) when writing a filter", async () => {
    // Keep the gallery view (so the gallery-sort control is on screen) while
    // carrying a non-filter primary param the merge must not drop.
    currentParams = new URLSearchParams("view=gallery&discipline=photography");
    render(<BrowsePortfoliosPage />);

    const sortSelect = getGallerySortSelect();
    fireEvent.change(sortSelect, { target: { value: "az" } });

    await waitFor(
      () => {
        expect(replace).toHaveBeenCalled();
      },
      { timeout: 1500 },
    );
    const urls = replace.mock.calls.map((c) => String(c[0]));
    // The new filter param AND the pre-existing primary params both survive.
    expect(
      urls.some(
        (u) => u.includes("gsort=az") && u.includes("discipline=photography"),
      ),
    ).toBe(true);
  });
});
