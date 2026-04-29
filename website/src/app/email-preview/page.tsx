// Dev-only email template browser. Lists every template in the registry
// with stream / persona / category filters and a search box. Click a
// template to preview the rendered HTML in a new tab.
//
// Not gated behind auth, add a check here or in middleware if you want
// to restrict it in production. Search-engine robots are blocked via
// the robots.txt at the root.

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { EMAIL_REGISTRY } from "@/emails/registry";
import type { EmailCategory, EmailPersona, EmailStream } from "@/emails/types/emailTypes";

const STREAM_OPTIONS: (EmailStream | "all")[] = ["all", "tx", "notify", "news"];
const PERSONA_OPTIONS: (EmailPersona | "all")[] = ["all", "artist", "venue", "customer", "multi", "system"];
const CATEGORY_OPTIONS: (EmailCategory | "all")[] = [
  "all", "security", "legal", "orders_and_payouts", "placements", "messages",
  "digests", "recommendations", "tips", "newsletter", "promotions",
];

const STREAM_COLOURS: Record<EmailStream, string> = {
  tx: "bg-red-50 text-red-700 border-red-200",
  notify: "bg-blue-50 text-blue-700 border-blue-200",
  news: "bg-amber-50 text-amber-700 border-amber-200",
};

const PERSONA_COLOURS: Record<EmailPersona, string> = {
  artist: "bg-[#C17C5A]/10 text-[#A9683E] border-[#E2C4B0]",
  venue: "bg-slate-100 text-slate-700 border-slate-200",
  customer: "bg-neutral-100 text-neutral-700 border-neutral-200",
  multi: "bg-violet-50 text-violet-700 border-violet-200",
  system: "bg-gray-100 text-gray-600 border-gray-200",
};

export default function EmailPreviewIndexPage() {
  const [query, setQuery] = useState("");
  const [stream, setStream] = useState<EmailStream | "all">("all");
  const [persona, setPersona] = useState<EmailPersona | "all">("all");
  const [category, setCategory] = useState<EmailCategory | "all">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return EMAIL_REGISTRY.filter((t) => {
      if (stream !== "all" && t.stream !== stream) return false;
      if (persona !== "all" && t.persona !== persona) return false;
      if (category !== "all" && t.category !== category) return false;
      if (q && !(t.id.includes(q) || t.name.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q))) return false;
      return true;
    }).sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.id.localeCompare(b.id);
    });
  }, [query, stream, persona, category]);

  const counts = useMemo(() => {
    const byStream: Record<EmailStream, number> = { tx: 0, notify: 0, news: 0 };
    for (const t of EMAIL_REGISTRY) byStream[t.stream] = (byStream[t.stream] || 0) + 1;
    return {
      total: EMAIL_REGISTRY.length,
      mvp: EMAIL_REGISTRY.filter((t) => t.priority === 1).length,
      byStream,
    };
  }, []);

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-10">
      <div className="mb-6">
        <p className="text-xs text-muted uppercase tracking-[0.2em] mb-2">Internal · Dev preview</p>
        <h1 className="text-3xl font-serif text-foreground">Email templates</h1>
        <p className="text-sm text-muted mt-2">
          {counts.total} templates · {counts.mvp} in MVP · tx {counts.byStream.tx} / notify {counts.byStream.notify} / news {counts.byStream.news}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6 pb-4 border-b border-border">
        <input
          type="text"
          placeholder="Search by id, name, or subject…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 min-w-[240px] px-3 py-2 border border-border rounded-sm text-sm focus:outline-none focus:border-accent"
        />
        <FilterSelect label="Stream" value={stream} options={STREAM_OPTIONS} onChange={(v) => setStream(v as EmailStream | "all")} />
        <FilterSelect label="Persona" value={persona} options={PERSONA_OPTIONS} onChange={(v) => setPersona(v as EmailPersona | "all")} />
        <FilterSelect label="Category" value={category} options={CATEGORY_OPTIONS} onChange={(v) => setCategory(v as EmailCategory | "all")} />
      </div>

      <p className="text-xs text-muted mb-3">{filtered.length} matching</p>

      <ul className="space-y-2">
        {filtered.map((t) => (
          <li key={t.id}>
            <Link
              href={`/email-preview/${t.id}`}
              target="_blank"
              className="flex flex-wrap items-start gap-3 p-4 border border-border rounded-sm hover:border-accent transition-colors bg-surface"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm font-medium text-foreground">{t.name}</h2>
                  <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm border ${STREAM_COLOURS[t.stream]}`}>
                    {t.stream}
                  </span>
                  <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm border ${PERSONA_COLOURS[t.persona]}`}>
                    {t.persona}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm border border-border text-muted">
                    {t.category}
                  </span>
                  {t.priority === 1 && (
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-black text-white">MVP</span>
                  )}
                  {t.hasInAppEquivalent && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-sm border border-border text-muted">in-app</span>
                  )}
                </div>
                <p className="text-xs text-muted mt-1 font-mono">{t.id}</p>
                <p className="text-sm text-foreground/80 mt-1.5 truncate">{t.subject}</p>
                {t.description && <p className="text-xs text-muted mt-0.5">{t.description}</p>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-2 py-1.5 border border-border rounded-sm text-sm text-foreground focus:outline-none focus:border-accent bg-surface"
      >
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}
