// Server-side render of a single email template to HTML, shown inside an
// iframe so the email's own CSS can't leak into the app's global styles.
// Rendering happens on the server using @react-email/render so we get the
// same output Resend would send.

import { notFound } from "next/navigation";
import { render } from "@react-email/components";
import Link from "next/link";
import { createElement } from "react";
import { findTemplate } from "@/emails/registry";

export const dynamic = "force-dynamic";

export default async function EmailPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const entry = findTemplate(id);
  if (!entry) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Component = entry.component as any;
  const html = await render(createElement(Component, entry.mock), { pretty: false });
  const plainText = await render(createElement(Component, entry.mock), { plainText: true });

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-8">
      <div className="mb-4">
        <Link href="/email-preview" className="text-xs text-muted hover:text-foreground">&larr; All templates</Link>
      </div>

      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <h1 className="text-2xl font-serif text-foreground">{entry.name}</h1>
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm border border-border text-muted">{entry.stream}</span>
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm border border-border text-muted">{entry.persona}</span>
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm border border-border text-muted">{entry.category}</span>
        </div>
        <p className="text-xs text-muted font-mono">{entry.id}</p>
      </div>

      <div className="grid md:grid-cols-[1fr_340px] gap-6 items-start">
        {/* Rendered preview */}
        <section>
          <p className="text-xs text-muted uppercase tracking-wider mb-2">Rendered</p>
          <div className="border border-border rounded-sm bg-[#FAF7F2]">
            <iframe
              srcDoc={html}
              title={entry.name}
              className="w-full bg-transparent"
              style={{ height: "880px", border: 0 }}
              sandbox=""
            />
          </div>
        </section>

        {/* Metadata + plain text */}
        <aside className="space-y-5 text-sm">
          <MetaRow label="Subject" value={entry.subject} mono />
          <MetaRow label="Preview text" value={entry.previewText} />
          <MetaRow label="Stream" value={entry.stream} />
          <MetaRow label="Persona" value={entry.persona} />
          <MetaRow label="Category" value={entry.category} />
          <MetaRow label="Priority" value={`${entry.priority}${entry.priority === 1 ? " (MVP)" : ""}`} />
          <MetaRow label="User can unsubscribe" value={entry.canUnsubscribe ? "Yes" : "No"} />
          <MetaRow label="Has in-app" value={entry.hasInAppEquivalent ? "Yes" : "No"} />

          <div>
            <p className="text-[10px] text-muted uppercase tracking-wider mb-1">Plain text fallback</p>
            <pre className="bg-[#FAF7F2] border border-border rounded-sm p-3 text-[11px] leading-relaxed whitespace-pre-wrap max-h-[320px] overflow-y-auto">
              {plainText}
            </pre>
          </div>

          <div>
            <p className="text-[10px] text-muted uppercase tracking-wider mb-1">Mock props used</p>
            <pre className="bg-[#FAF7F2] border border-border rounded-sm p-3 text-[11px] leading-relaxed whitespace-pre-wrap max-h-[320px] overflow-y-auto">
              {JSON.stringify(entry.mock, null, 2)}
            </pre>
          </div>
        </aside>
      </div>
    </div>
  );
}

function MetaRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-muted uppercase tracking-wider mb-0.5">{label}</p>
      <p className={`text-sm text-foreground ${mono ? "font-mono text-xs" : ""}`}>{value}</p>
    </div>
  );
}
