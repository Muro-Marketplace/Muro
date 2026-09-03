"use client";

import Link from "next/link";
import { navItemOwnsPath, type PortalNavItem } from "@/lib/portal-nav";

interface PortalSectionTabsProps {
  /** The pages of the current group, in sidebar order. */
  tabs: PortalNavItem[];
  /** The portal path the page reports, the same value the layout receives. */
  activePath: string;
  /** The group these pages belong to; names the strip for assistive tech. */
  label?: string;
}

/**
 * The strip a grouped portal page carries across its top, so the artist can
 * move between the pages of one group (Messages, Enquiries, Placements,
 * Offers, Orders) without going back to the sidebar. Plain links rather than
 * ARIA tabs: each one is a page with a URL of its own, and the current one is
 * marked with aria-current.
 *
 * Renders nothing for a group with a single page (Social while BLOGS_V1 is
 * off), because a strip of one tab leads nowhere.
 */
export default function PortalSectionTabs({ tabs, activePath, label }: PortalSectionTabsProps) {
  if (tabs.length < 2) return null;
  return (
    <nav aria-label={label ? `${label} sections` : "Sections"} className="mb-5 border-b border-border">
      <ul className="flex gap-1 overflow-x-auto whitespace-nowrap">
        {tabs.map((tab) => {
          const active = navItemOwnsPath(tab, activePath);
          return (
            <li key={tab.href} className="shrink-0">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`block -mb-px border-b-2 px-3 py-2.5 text-sm transition-colors duration-150 ${
                  active
                    ? "border-accent text-accent font-medium"
                    : "border-transparent text-foreground/70 hover:text-foreground hover:border-border"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
