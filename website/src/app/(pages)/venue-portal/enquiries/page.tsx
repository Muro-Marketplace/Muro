"use client";

import { useState } from "react";
import VenuePortalLayout from "@/components/VenuePortalLayout";

type Status = "Pending" | "Responded" | "Closed";
type FilterTab = "All" | Status;

interface Enquiry {
  id: number;
  artist: string;
  subject: string;
  type: "Free Loan" | "Revenue Share" | "Purchase";
  dateSent: string;
  status: Status;
}

// TODO: Replace with Supabase query for the logged-in venue's enquiries
const enquiries: Enquiry[] = [];

const statusBadge = (status: Status) => {
  const styles: Record<Status, string> = {
    Pending: "bg-amber-50 text-amber-700 border-amber-200",
    Responded: "bg-green-50 text-green-700 border-green-200",
    Closed: "bg-background text-muted border-border",
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 text-[11px] font-medium border rounded-full ${styles[status]}`}
    >
      {status}
    </span>
  );
};

const FILTER_TABS: FilterTab[] = ["All", "Pending", "Responded", "Closed"];

export default function EnquiriesPage() {
  const [activeFilter, setActiveFilter] = useState<FilterTab>("All");

  const filtered =
    activeFilter === "All"
      ? enquiries
      : enquiries.filter((e) => e.status === activeFilter);

  return (
    <VenuePortalLayout>
      <div className="mb-6">
        <h1 className="font-serif text-2xl lg:text-3xl text-foreground mb-1">
          My Enquiries
        </h1>
        <p className="text-sm text-muted">
          Track your conversations with artists.
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {FILTER_TABS.map((tab) => {
          const count =
            tab === "All"
              ? enquiries.length
              : enquiries.filter((e) => e.status === tab).length;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveFilter(tab)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors duration-150 border-b-2 -mb-px cursor-pointer ${
                activeFilter === tab
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {tab}
              <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-background border border-border rounded-full text-muted">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block bg-white border border-border rounded-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-background">
              <th className="text-left px-5 py-3 text-xs font-medium text-muted uppercase tracking-wide">
                Artist
              </th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted uppercase tracking-wide">
                Subject / Piece
              </th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted uppercase tracking-wide">
                Type
              </th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted uppercase tracking-wide">
                Date Sent
              </th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted uppercase tracking-wide">
                Status
              </th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((enquiry) => (
              <tr key={enquiry.id} className="hover:bg-background/50 transition-colors">
                <td className="px-5 py-4 font-medium text-foreground whitespace-nowrap">
                  {enquiry.artist}
                </td>
                <td className="px-5 py-4 text-muted max-w-xs">
                  <span className="line-clamp-1">{enquiry.subject}</span>
                </td>
                <td className="px-5 py-4 whitespace-nowrap">
                  <span className="text-xs px-2 py-0.5 bg-background border border-border rounded-sm text-foreground/70">
                    {enquiry.type}
                  </span>
                </td>
                <td className="px-5 py-4 text-muted whitespace-nowrap">
                  {enquiry.dateSent}
                </td>
                <td className="px-5 py-4 whitespace-nowrap">
                  {statusBadge(enquiry.status)}
                </td>
                <td className="px-5 py-4 text-right whitespace-nowrap">
                  <button
                    type="button"
                    className="text-xs text-accent hover:underline cursor-pointer"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-muted text-sm">
            No enquiries in this category.
          </div>
        )}
      </div>

      {/* Mobile list */}
      <div className="lg:hidden space-y-3">
        {filtered.length === 0 ? (
          <p className="text-center text-muted text-sm py-10">
            No enquiries in this category.
          </p>
        ) : (
          filtered.map((enquiry) => (
            <div
              key={enquiry.id}
              className="bg-white border border-border rounded-sm p-4"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <p className="font-medium text-sm text-foreground">
                    {enquiry.artist}
                  </p>
                  <p className="text-xs text-muted mt-0.5">{enquiry.dateSent}</p>
                </div>
                {statusBadge(enquiry.status)}
              </div>
              <p className="text-sm text-muted leading-snug mb-3">
                {enquiry.subject}
              </p>
              <div className="flex items-center justify-between">
                <span className="text-xs px-2 py-0.5 bg-background border border-border rounded-sm text-foreground/70">
                  {enquiry.type}
                </span>
                <button
                  type="button"
                  className="text-xs text-accent hover:underline cursor-pointer"
                >
                  View Details
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </VenuePortalLayout>
  );
}
