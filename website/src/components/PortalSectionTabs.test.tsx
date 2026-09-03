// @vitest-environment jsdom
//
// The strip a grouped artist-portal page carries across its top. Plain links
// with aria-current on the current page, laid out on one line that scrolls
// sideways on a narrow screen instead of wrapping.

import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import PortalSectionTabs from "./PortalSectionTabs";

const TABS = [
  { label: "Messages", href: "/artist-portal/messages" },
  { label: "Enquiries", href: "/artist-portal/enquiries" },
  { label: "Offers", flatLabel: "My Offers", href: "/artist-portal/offers" },
  { label: "Orders", href: "/artist-portal/orders" },
];

afterEach(cleanup);

function links() {
  return screen.getAllByRole("link");
}

describe("<PortalSectionTabs />", () => {
  it("renders one link per tab, in order, under the tab's own label", () => {
    render(<PortalSectionTabs tabs={TABS} activePath="/artist-portal/messages" label="Venues & Buyers" />);
    expect(links().map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Messages", "/artist-portal/messages"],
      ["Enquiries", "/artist-portal/enquiries"],
      ["Offers", "/artist-portal/offers"],
      ["Orders", "/artist-portal/orders"],
    ]);
  });

  it("names the strip after its group", () => {
    render(<PortalSectionTabs tabs={TABS} activePath="/artist-portal/messages" label="Venues & Buyers" />);
    expect(screen.getByRole("navigation", { name: "Venues & Buyers sections" })).toBeTruthy();
  });

  it("falls back to a generic name without a group label", () => {
    render(<PortalSectionTabs tabs={TABS} activePath="/artist-portal/messages" />);
    expect(screen.getByRole("navigation", { name: "Sections" })).toBeTruthy();
  });

  it("marks the current page with aria-current, and only that one", () => {
    render(<PortalSectionTabs tabs={TABS} activePath="/artist-portal/enquiries" />);
    const current = links().filter((a) => a.getAttribute("aria-current") === "page");
    expect(current.map((a) => a.textContent)).toEqual(["Enquiries"]);
    expect(screen.getByRole("link", { name: "Enquiries" }).className).toContain("text-accent");
    expect(screen.getByRole("link", { name: "Messages" }).className).not.toContain("text-accent");
  });

  it("keeps the tab lit on a sub-route of its page", () => {
    render(<PortalSectionTabs tabs={TABS} activePath="/artist-portal/orders/ord_123?from=email" />);
    expect(screen.getByRole("link", { name: "Orders" }).getAttribute("aria-current")).toBe("page");
    expect(links().filter((a) => a.getAttribute("aria-current")).length).toBe(1);
  });

  it("lights nothing when the path is outside the group", () => {
    render(<PortalSectionTabs tabs={TABS} activePath="/artist-portal/saved" />);
    expect(links().filter((a) => a.getAttribute("aria-current")).length).toBe(0);
  });

  it("renders nothing for a group with a single page", () => {
    const { container } = render(<PortalSectionTabs tabs={[TABS[0]]} activePath="/artist-portal/messages" />);
    expect(container.innerHTML).toBe("");
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("renders nothing for no tabs at all", () => {
    const { container } = render(<PortalSectionTabs tabs={[]} activePath="/artist-portal" />);
    expect(container.innerHTML).toBe("");
  });

  it("lays the tabs out on one line that scrolls sideways", () => {
    render(<PortalSectionTabs tabs={TABS} activePath="/artist-portal/messages" label="Venues & Buyers" />);
    const list = within(screen.getByRole("navigation")).getByRole("list");
    expect(list.className).toContain("overflow-x-auto");
    expect(list.className).toContain("whitespace-nowrap");
    for (const item of within(list).getAllByRole("listitem")) {
      expect(item.className).toContain("shrink-0");
    }
  });
});
