// @vitest-environment jsdom
//
// Tests for signup/page.tsx — a server component. We call it as an async
// function and await the JSX, then render that into jsdom. This lets us
// assert the forwarded ?next= values on the role links without needing a
// full Next.js runtime.

import { describe, expect, it, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

// signup/page.tsx imports next/image, next/link, and RedirectIfLoggedIn.
// Mock them to keep the test environment simple.
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    const { src, alt, ...rest } = props as { src: string; alt: string; fill?: boolean; priority?: boolean; sizes?: string };
    return <img src={src} alt={alt} />;
  },
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

// RedirectIfLoggedIn wraps children; no auth in these tests so just render.
vi.mock("@/components/RedirectIfLoggedIn", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import SignUpPage from "./page";

afterEach(() => cleanup());

// Helper: build the searchParams Promise arg that the page expects.
function makeSearchParams(params: Record<string, string>) {
  return Promise.resolve(params) as Promise<{ [key: string]: string | string[] | undefined }>;
}

// Match exactly the three role links: /signup/artist, /signup/venue,
// /signup/customer (with or without ?next= suffix, but NOT /signup on its own).
const ROLE_LINK_RE = /\/signup\/(artist|venue|customer)/;

describe("SignUpPage — forwarded ?next= on role links", () => {
  it("appends ?next= to each role link when inbound next is a safe path", async () => {
    const jsx = await SignUpPage({ searchParams: makeSearchParams({ next: "/checkout" }) });
    const { getAllByRole } = render(jsx as React.ReactElement);
    const links = getAllByRole("link") as HTMLAnchorElement[];
    const roleLinks = links.filter((l) => ROLE_LINK_RE.test(l.getAttribute("href") ?? ""));
    expect(roleLinks).toHaveLength(3);
    for (const link of roleLinks) {
      expect(link.getAttribute("href")).toContain("next=%2Fcheckout");
    }
  });

  it("drops ?next= from role links when inbound next is an external URL", async () => {
    const jsx = await SignUpPage({ searchParams: makeSearchParams({ next: "https://evil.com" }) });
    const { getAllByRole } = render(jsx as React.ReactElement);
    const links = getAllByRole("link") as HTMLAnchorElement[];
    const roleLinks = links.filter((l) => ROLE_LINK_RE.test(l.getAttribute("href") ?? ""));
    expect(roleLinks).toHaveLength(3);
    for (const link of roleLinks) {
      expect(link.getAttribute("href")).not.toContain("next=");
      expect(link.getAttribute("href")).not.toContain("evil");
    }
  });

  it("omits ?next= suffix when no next param is present", async () => {
    const jsx = await SignUpPage({ searchParams: makeSearchParams({}) });
    const { getAllByRole } = render(jsx as React.ReactElement);
    const links = getAllByRole("link") as HTMLAnchorElement[];
    const roleLinks = links.filter((l) => ROLE_LINK_RE.test(l.getAttribute("href") ?? ""));
    expect(roleLinks).toHaveLength(3);
    for (const link of roleLinks) {
      expect(link.getAttribute("href")).not.toContain("next=");
    }
  });
});

describe("SignUpPage — forwarded ?next= on Sign in link", () => {
  it("appends ?next= to the Sign in link when inbound next is a safe path", async () => {
    const jsx = await SignUpPage({ searchParams: makeSearchParams({ next: "/checkout" }) });
    const { getAllByRole } = render(jsx as React.ReactElement);
    const links = getAllByRole("link") as HTMLAnchorElement[];
    const signInLink = links.find((l) => l.getAttribute("href")?.startsWith("/login"));
    expect(signInLink).toBeDefined();
    expect(signInLink!.getAttribute("href")).toContain("next=%2Fcheckout");
  });

  it("emits a plain /login link when inbound next is an external URL", async () => {
    const jsx = await SignUpPage({ searchParams: makeSearchParams({ next: "https://evil.com" }) });
    const { getAllByRole } = render(jsx as React.ReactElement);
    const links = getAllByRole("link") as HTMLAnchorElement[];
    const signInLink = links.find((l) => l.getAttribute("href")?.startsWith("/login"));
    expect(signInLink).toBeDefined();
    expect(signInLink!.getAttribute("href")).toBe("/login");
  });
});
