// @vitest-environment jsdom
//
// A5. `/` sits outside the (pages) route group and renders its own shell, so
// it never got the skip link, demo banner and feedback bubble that
// (pages)/layout.tsx gives every other page. The busiest page on the site was
// the only one a keyboard user could not skip the nav on, and a signed-in
// demo visitor saw no demo banner there.

import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

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
