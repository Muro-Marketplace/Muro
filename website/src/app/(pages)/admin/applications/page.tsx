"use client";

import { useState, useEffect } from "react";
import AdminPortalLayout from "@/components/AdminPortalLayout";
import { authFetch } from "@/lib/api-client";

interface Application {
  id: string;
  name: string;
  email: string;
  location: string;
  instagram: string;
  website: string;
  primary_medium: string;
  portfolio_link: string;
  artist_statement: string;
  offers_originals: boolean;
  offers_prints: boolean;
  offers_framed: boolean;
  offers_commissions: boolean;
  open_to_free_loan: boolean;
  open_to_revenue_share: boolean;
  open_to_purchase: boolean;
  delivery_radius: string;
  venue_types: string[];
  themes: string[];
  hear_about: string;
  selected_plan: string;
  status: string;
  reviewed_at: string | null;
  created_at: string;
}

type TabFilter = "all" | "pending" | "accepted" | "rejected";

export default function AdminApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabFilter>("pending");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  async function loadApplications() {
    setLoading(true);
    try {
      const url = activeTab === "all"
        ? "/api/admin/applications"
        : `/api/admin/applications?status=${activeTab}`;
      const res = await authFetch(url);
      if (res.ok) {
        const data = await res.json();
        setApplications(data.applications || []);
      }
    } catch (err) {
      console.error("Failed to load applications:", err);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadApplications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  async function handleAction(id: string, action: "accept" | "reject") {
    if (action === "accept" && !confirm("Accept this artist? An invite email will be sent.")) return;
    if (action === "reject" && !confirm("Reject this application?")) return;

    setActionLoading(id);
    try {
      const res = await authFetch(`/api/admin/applications/${id}`, {
        method: "PUT",
        body: JSON.stringify({ action }),
      });
      const data = await res.json();

      if (res.ok) {
        setToast(
          action === "accept"
            ? `Accepted. ${data.message || ""}`
            : "Application rejected."
        );
        setTimeout(() => setToast(""), 4000);
        loadApplications();
        setExpandedId(null);
      } else {
        alert(data.error || "Action failed");
      }
    } catch {
      alert("Network error");
    }
    setActionLoading(null);
  }

  const tabs: { label: string; value: TabFilter }[] = [
    { label: "Pending", value: "pending" },
    { label: "Accepted", value: "accepted" },
    { label: "Rejected", value: "rejected" },
    { label: "All", value: "all" },
  ];

  return (
    <AdminPortalLayout activePath="/admin/applications">
      <h1 className="text-2xl lg:text-3xl mb-6">Applications</h1>

      {/* Toast */}
      {toast && (
        <div className="mb-4 px-4 py-3 bg-accent/10 border border-accent/20 text-accent text-sm rounded-sm">
          {toast}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.value
                ? "border-accent text-accent"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-muted text-sm py-8 text-center">Loading applications...</p>
      ) : applications.length === 0 ? (
        <p className="text-muted text-sm py-8 text-center">No {activeTab === "all" ? "" : activeTab} applications.</p>
      ) : (
        <div className="space-y-3">
          {applications.map((app) => (
            <div key={app.id} className="bg-white border border-border rounded-sm overflow-hidden">
              {/* Summary row */}
              <button
                onClick={() => setExpandedId(expandedId === app.id ? null : app.id)}
                className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-surface/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-medium text-foreground">{app.name}</p>
                    <span className={`px-2 py-0.5 text-[10px] font-medium rounded-sm uppercase ${
                      app.status === "pending" ? "bg-yellow-50 text-yellow-700 border border-yellow-200" :
                      app.status === "accepted" ? "bg-green-50 text-green-700 border border-green-200" :
                      "bg-red-50 text-red-700 border border-red-200"
                    }`}>
                      {app.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted">
                    {app.email} &middot; {app.primary_medium || "No medium"} &middot; {app.location || "No location"}
                  </p>
                </div>
                <p className="text-xs text-muted shrink-0">
                  {new Date(app.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </p>
                <svg
                  width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
                  className={`shrink-0 text-muted transition-transform ${expandedId === app.id ? "rotate-180" : ""}`}
                >
                  <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {/* Expanded details */}
              {expandedId === app.id && (
                <div className="px-5 pb-5 border-t border-border">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4">
                    {/* Left column */}
                    <div className="space-y-4">
                      <div>
                        <p className="text-xs text-muted uppercase tracking-wider mb-1">Portfolio</p>
                        {app.portfolio_link ? (
                          <a href={app.portfolio_link.startsWith("http") ? app.portfolio_link : `https://${app.portfolio_link}`} target="_blank" rel="noopener noreferrer" className="text-sm text-accent hover:underline break-all">
                            {app.portfolio_link}
                          </a>
                        ) : (
                          <p className="text-sm text-muted">Not provided</p>
                        )}
                      </div>

                      {app.instagram && (
                        <div>
                          <p className="text-xs text-muted uppercase tracking-wider mb-1">Instagram</p>
                          <a href={`https://instagram.com/${app.instagram.replace("@", "")}`} target="_blank" rel="noopener noreferrer" className="text-sm text-accent hover:underline">
                            {app.instagram}
                          </a>
                        </div>
                      )}

                      {app.website && (
                        <div>
                          <p className="text-xs text-muted uppercase tracking-wider mb-1">Website</p>
                          <a href={app.website.startsWith("http") ? app.website : `https://${app.website}`} target="_blank" rel="noopener noreferrer" className="text-sm text-accent hover:underline break-all">
                            {app.website}
                          </a>
                        </div>
                      )}

                      <div>
                        <p className="text-xs text-muted uppercase tracking-wider mb-1">Artist Statement</p>
                        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                          {app.artist_statement || "Not provided"}
                        </p>
                      </div>
                    </div>

                    {/* Right column */}
                    <div className="space-y-4">
                      <div>
                        <p className="text-xs text-muted uppercase tracking-wider mb-1">Offerings</p>
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            app.offers_originals && "Originals",
                            app.offers_prints && "Prints",
                            app.offers_framed && "Framed",
                            app.offers_commissions && "Commissions",
                          ].filter(Boolean).map((o) => (
                            <span key={o as string} className="px-2 py-0.5 text-[10px] bg-accent/10 text-accent border border-accent/20 rounded-sm">{o}</span>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="text-xs text-muted uppercase tracking-wider mb-1">Arrangements</p>
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            app.open_to_free_loan && "Paid Loan",
                            app.open_to_revenue_share && "Revenue Share",
                            app.open_to_purchase && "Purchase",
                          ].filter(Boolean).map((o) => (
                            <span key={o as string} className="px-2 py-0.5 text-[10px] bg-surface text-muted border border-border rounded-sm">{o}</span>
                          ))}
                        </div>
                      </div>

                      {app.delivery_radius && (
                        <div>
                          <p className="text-xs text-muted uppercase tracking-wider mb-1">Delivery</p>
                          <p className="text-sm text-foreground">{app.delivery_radius}</p>
                        </div>
                      )}

                      {app.venue_types?.length > 0 && (
                        <div>
                          <p className="text-xs text-muted uppercase tracking-wider mb-1">Venue Types</p>
                          <p className="text-sm text-foreground">{app.venue_types.join(", ")}</p>
                        </div>
                      )}

                      {app.themes?.length > 0 && (
                        <div>
                          <p className="text-xs text-muted uppercase tracking-wider mb-1">Themes</p>
                          <p className="text-sm text-foreground">{app.themes.join(", ")}</p>
                        </div>
                      )}

                      <div>
                        <p className="text-xs text-muted uppercase tracking-wider mb-1">Selected Plan</p>
                        <p className="text-sm text-foreground capitalize">{app.selected_plan || "core"}</p>
                      </div>

                      {app.hear_about && (
                        <div>
                          <p className="text-xs text-muted uppercase tracking-wider mb-1">How They Heard</p>
                          <p className="text-sm text-foreground">{app.hear_about}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  {app.status === "pending" && (
                    <div className="flex gap-3 mt-6 pt-4 border-t border-border">
                      <button
                        onClick={() => handleAction(app.id, "accept")}
                        disabled={actionLoading === app.id}
                        className="px-5 py-2.5 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-sm transition-colors disabled:opacity-50"
                      >
                        {actionLoading === app.id ? "Processing..." : "Accept Artist"}
                      </button>
                      <button
                        onClick={() => handleAction(app.id, "reject")}
                        disabled={actionLoading === app.id}
                        className="px-5 py-2.5 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-sm transition-colors disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  )}

                  {app.reviewed_at && (
                    <p className="text-xs text-muted mt-4">
                      Reviewed {new Date(app.reviewed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </AdminPortalLayout>
  );
}
