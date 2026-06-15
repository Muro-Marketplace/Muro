// @vitest-environment jsdom
/**
 * Touch-target safety: every Button variant and size must carry `min-h-11`
 * (44 px) in its className so the rendered element meets WCAG 2.5.5 /
 * Apple HIG tap-target guidelines.
 *
 * jsdom does not compute Tailwind pixel values, so we assert on the class
 * string directly. The Playwright tap-target audit (tests/e2e/tap-targets.spec.ts)
 * covers the rendered bounding-box check against a running dev server.
 */
import { describe, expect, it, afterEach, vi } from "vitest";
import { render, cleanup, within } from "@testing-library/react";
import Button from "./Button";

// next/link requires a router context in jsdom; stub it out.
vi.mock("next/link", () => ({
  default: ({
    href,
    className,
    children,
  }: {
    href: string;
    className?: string;
    children: React.ReactNode;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

// Clean up the DOM between tests so accumulated renders don't cause
// "Found multiple elements with the role" errors.
afterEach(cleanup);

describe("Button — touch-target safety (min-h-11)", () => {
  it("default render carries min-h-11", () => {
    const { container } = render(<Button>Click me</Button>);
    const el = within(container).getByRole("button");
    expect(el.className).toContain("min-h-11");
  });

  it("size=sm carries min-h-11", () => {
    const { container } = render(<Button size="sm">Small</Button>);
    const el = within(container).getByRole("button");
    expect(el.className).toContain("min-h-11");
  });

  it("size=md carries min-h-11", () => {
    const { container } = render(<Button size="md">Medium</Button>);
    const el = within(container).getByRole("button");
    expect(el.className).toContain("min-h-11");
  });

  it("size=lg carries min-h-11", () => {
    const { container } = render(<Button size="lg">Large</Button>);
    const el = within(container).getByRole("button");
    expect(el.className).toContain("min-h-11");
  });

  it("rendered as a link (href) carries min-h-11", () => {
    const { container } = render(<Button href="/pricing">Pricing</Button>);
    const el = within(container).getByRole("link");
    expect(el.className).toContain("min-h-11");
  });

  it("rendered as a button element carries min-h-11", () => {
    const { container } = render(<Button type="submit">Submit</Button>);
    const el = within(container).getByRole("button");
    expect(el.className).toContain("min-h-11");
  });

  it("variant=accent carries min-h-11", () => {
    const { container } = render(<Button variant="accent">Accent</Button>);
    const el = within(container).getByRole("button");
    expect(el.className).toContain("min-h-11");
  });

  it("variant=secondary carries min-h-11", () => {
    const { container } = render(
      <Button variant="secondary">Secondary</Button>,
    );
    const el = within(container).getByRole("button");
    expect(el.className).toContain("min-h-11");
  });

  it("variant=ghost carries min-h-11", () => {
    const { container } = render(<Button variant="ghost">Ghost</Button>);
    const el = within(container).getByRole("button");
    expect(el.className).toContain("min-h-11");
  });

  it("custom className does not remove min-h-11", () => {
    const { container } = render(
      <Button className="mt-4 w-full">Custom</Button>,
    );
    const el = within(container).getByRole("button");
    expect(el.className).toContain("min-h-11");
  });
});
