// @vitest-environment jsdom
//
// A5. `/` sits outside the (pages) route group and renders its own shell, so
// it never got the skip link, demo banner and feedback bubble that
// (pages)/layout.tsx gives every other page. The busiest page on the site was
// the only one a keyboard user could not skip the nav on, and a signed-in
// demo visitor saw no demo banner there.

import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PROGRAMME_LADDER } from "@/lib/curation-tiers";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
}));
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: null, session: null, loading: false, userType: null }),
}));
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { alt } = props as { alt?: string };
    return <span data-testid="img" aria-label={alt} />;
  },
}));
vi.mock("@/components/Header", () => ({ default: () => <header>header</header> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer>footer</footer> }));
vi.mock("@/components/ArtistCarousel", () => ({ default: () => <div>carousel</div> }));
vi.mock("@/components/AnimateIn", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/DemoBanner", () => ({ default: () => <div data-testid="demo-banner" /> }));
vi.mock("@/components/FeedbackBubble", () => ({ default: () => <div data-testid="feedback-bubble" /> }));

const fetchMock = vi.fn((url: string) => {
  if (String(url).startsWith("/api/browse-artists")) {
    return Promise.resolve({
      ok: true,
      json: async () => ({
        artists: [
          { slug: "maya-chen", name: "Maya Chen", image: "https://example.test/maya.jpg" },
          { slug: "no-image", name: "No Image", image: "" },
          { slug: "seed-one", name: "Seed One", image: "https://example.test/seed.jpg", isSeedArtist: true },
        ],
      }),
    });
  }
  return Promise.resolve({ ok: false, json: async () => null });
});
vi.stubGlobal("fetch", fetchMock);

import Home from "./page";

afterEach(cleanup);

describe("homepage shell parity with (pages)/layout (A5)", () => {
  it("offers a skip link that targets a real main landmark", () => {
    const { container } = render(<Home />);

    const skip = screen.getByRole("link", { name: /skip to content/i });
    expect(skip.getAttribute("href")).toBe("#main-content");

    // The target must actually exist, otherwise the link is decorative.
    const main = container.querySelector("main#main-content");
    expect(main).not.toBeNull();
  });

  it("mounts the demo banner and the feedback bubble", () => {
    render(<Home />);
    expect(screen.getByTestId("demo-banner")).toBeTruthy();
    expect(screen.getByTestId("feedback-bubble")).toBeTruthy();
  });

  it("keeps the footer outside the main landmark", () => {
    const { container } = render(<Home />);
    const main = container.querySelector("main#main-content");
    expect(main?.querySelector("footer")).toBeNull();
  });
});

describe("homepage featured artists (launch audit, blocker 1)", () => {
  it("renders real artists from the browse endpoint, never the seed file", async () => {
    render(<Home />);
    const tile = await screen.findByRole("link", { name: /maya chen/i });
    expect(tile.getAttribute("href")).toBe("/browse/maya-chen");
    expect(screen.queryByRole("link", { name: /no image/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /james okafor/i })).toBeNull();
  });

  it("does not import the seed catalogue at all", () => {
    const src = readFileSync(join(process.cwd(), "src/app/page.tsx"), "utf8");
    expect(src).not.toMatch(/from "@\/data\/artists"/);
  });

  it("never shows a seed artist even when the browse endpoint returns one (Finding 5)", async () => {
    render(<Home />);
    await screen.findByRole("link", { name: /maya chen/i });
    expect(screen.queryByRole("link", { name: /seed one/i })).toBeNull();
    expect(
      screen.queryAllByRole("link").some((l) => l.getAttribute("href") === "/browse/seed-one"),
    ).toBe(false);
  });

  it("describes the hero image honestly", () => {
    render(<Home />);
    expect(screen.queryByLabelText("Gallery interior")).toBeNull();
    expect(screen.getByLabelText("Close-up of textured paint strokes on canvas")).toBeTruthy();
  });

  it("keeps the copy pinned to the second column so it cannot jump when tiles arrive", () => {
    const { container } = render(<Home />);
    const copy = container.querySelector(".order-1.lg\\:order-2");
    expect(copy?.className).toContain("lg:col-start-2");
  });
});

describe("homepage sells Programmes (launch audit, section 02)", () => {
  it("has a Programmes section with the price ladder and a link to /programmes", () => {
    render(<Home />);
    expect(screen.getAllByText(/Wallplace Programmes/).length).toBeGreaterThan(0);
    const link = screen.getAllByRole("link", { name: /^see programmes$/i })[0];
    expect(link.getAttribute("href")).toBe("/programmes");
    for (const rung of PROGRAMME_LADDER) {
      expect(screen.getByText(`${rung.pieces} pieces`)).toBeTruthy();
    }
  });
});
