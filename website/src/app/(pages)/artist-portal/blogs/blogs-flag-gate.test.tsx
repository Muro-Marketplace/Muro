// @vitest-environment jsdom
// bug-12 part 2. BLOGS_V1 is off in prod and /api/blogs 403s every save, but the
// client had no gate at all: the Blogs nav item always rendered and all three blog
// pages served a fully interactive editor whose every save failed. The pages now
// notFound() and the nav item is conditional on the flag.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { notFoundMock, flagMock } = vi.hoisted(() => ({
  notFoundMock: vi.fn(() => {
    // Mirrors Next's behaviour: notFound() throws, so nothing after it runs.
    throw new Error("NEXT_NOT_FOUND");
  }),
  flagMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
  useParams: () => ({ id: "b1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/artist-portal/blogs",
}));
vi.mock("@/lib/feature-flags", () => ({ isFlagOn: (f: string) => flagMock(f) }));
vi.mock("@/lib/supabase", () => ({ supabase: { auth: {}, from: () => ({}) } }));
vi.mock("@/lib/api-client", () => ({ authFetch: vi.fn(() => new Promise(() => {})) }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" }, signOut: vi.fn() }) }));
vi.mock("@/components/ArtistPortalLayout", () => ({ default: ({ children }: { children: unknown }) => children }));
vi.mock("@/components/BlogEditor", () => ({ default: () => <div>BLOG EDITOR</div> }));
vi.mock("next/link", () => ({ default: ({ children }: { children: unknown }) => children }));
vi.mock("next/image", () => ({ default: () => null }));

import ArtistBlogsPage from "./page";
import NewBlogPage from "./new/page";
import EditBlogPage from "./[id]/edit/page";

afterEach(() => cleanup());
beforeEach(() => {
  notFoundMock.mockClear();
  flagMock.mockReset();
});

const PAGES: Array<[string, () => React.ReactNode]> = [
  ["blogs list", ArtistBlogsPage],
  ["new blog", NewBlogPage],
  ["edit blog", EditBlogPage],
];

describe("bug-12: blog pages are gated on BLOGS_V1", () => {
  for (const [name, Page] of PAGES) {
    it(`${name} calls notFound() when the flag is off`, () => {
      flagMock.mockReturnValue(false);
      // notFound() throws, which is exactly what Next relies on to stop rendering.
      expect(() => render(<Page />)).toThrow("NEXT_NOT_FOUND");
      expect(notFoundMock).toHaveBeenCalled();
    });
  }

  it("renders the editor instead of 404ing when the flag is on", () => {
    flagMock.mockReturnValue(true);
    render(<NewBlogPage />);
    expect(notFoundMock).not.toHaveBeenCalled();
    expect(screen.getByText("BLOG EDITOR")).toBeTruthy();
  });
});
