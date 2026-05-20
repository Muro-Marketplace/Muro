"use client";

import Link from "next/link";

export interface BreadcrumbItem {
  /** Display text. Required. */
  label: string;
  /** If omitted, the item is rendered as plain text (current page). */
  href?: string;
}

/**
 * Lightweight breadcrumb trail. Hides itself when items is empty so
 * pages can pass a derived list without a wrapping conditional.
 *
 * Convention: the LAST item is the current page (no href). Earlier
 * items are links back up the hierarchy.
 */
export default function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className="text-xs text-muted mb-3">
      <ol className="flex items-center gap-1.5 flex-wrap">
        {items.map((it, idx) => {
          const isLast = idx === items.length - 1;
          return (
            <li key={`${it.label}-${idx}`} className="flex items-center gap-1.5">
              {it.href && !isLast ? (
                <Link
                  href={it.href}
                  className="hover:text-foreground transition-colors"
                >
                  {it.label}
                </Link>
              ) : (
                <span className={isLast ? "text-foreground" : ""}>{it.label}</span>
              )}
              {!isLast && <span aria-hidden>›</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
