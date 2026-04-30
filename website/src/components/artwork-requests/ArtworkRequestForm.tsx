"use client";

// Shared "describe an artwork request" form. Backs both:
//   - /venue-portal/artwork-requests/new   (POST)
//   - /venue-portal/artwork-requests/[id]/edit (PATCH)
//
// Earlier the form lived inline on the new page only; the edit route
// didn't exist at all. Moving it here lets the edit page render an
// identical form with prefilled values and submit via a different
// callback, instead of forking a near-duplicate page.

import { useState } from "react";

const INTENT_OPTIONS: {
  key: "purchase" | "commission" | "display" | "loan";
  label: string;
  hint: string;
}[] = [
  { key: "purchase", label: "Purchase", hint: "Buy outright at an agreed price." },
  { key: "commission", label: "Commission", hint: "Custom-make something for the space." },
  { key: "display", label: "QR-enabled display", hint: "Show the work; QR drives sales with a revenue share." },
  { key: "loan", label: "Paid Loan", hint: "Pay a monthly fee to display." },
];

const TIMESCALE_OPTIONS: { key: "asap" | "weeks" | "months" | "flexible"; label: string }[] = [
  { key: "asap", label: "ASAP" },
  { key: "weeks", label: "Within weeks" },
  { key: "months", label: "Within months" },
  { key: "flexible", label: "Flexible" },
];

const Required = () => <span className="text-red-500">*</span>;

export type IntentKey = (typeof INTENT_OPTIONS)[number]["key"];
export type TimescaleKey = (typeof TIMESCALE_OPTIONS)[number]["key"];
export type Visibility = "semi_public" | "private";

/** Initial values used to prefill the form when editing. All optional
 *  — `new` mode passes none of these. */
export interface ArtworkRequestInitial {
  title?: string;
  description?: string;
  intent?: IntentKey[];
  qrRevenueSharePercent?: number | null;
  styles?: string[];
  mediums?: string[];
  budgetMinPence?: number | null;
  budgetMaxPence?: number | null;
  location?: string | null;
  timescale?: TimescaleKey | null;
  visibility?: Visibility;
  invitedArtistSlugs?: string[];
}

/** Submit payload shape — same as the API contract. The form
 *  normalises strings → arrays, %, pence, etc. before handing it
 *  back to the caller's onSubmit. */
export interface ArtworkRequestPayload {
  title: string;
  description: string;
  intent: IntentKey[];
  qrRevenueSharePercent?: number;
  styles: string[];
  mediums: string[];
  budgetMinPence?: number;
  budgetMaxPence?: number;
  location?: string;
  timescale?: TimescaleKey;
  visibility: Visibility;
  invitedArtistSlugs: string[];
}

interface Props {
  initial?: ArtworkRequestInitial;
  /** Heading + button copy varies; default to "Post" wording. */
  mode: "create" | "edit";
  onSubmit: (payload: ArtworkRequestPayload) => Promise<void>;
  onCancel: () => void;
}

export default function ArtworkRequestForm({ initial = {}, mode, onSubmit, onCancel }: Props) {
  const [title, setTitle] = useState(initial.title || "");
  const [description, setDescription] = useState(initial.description || "");
  // No intent pre-selected on create; edit mode honours whatever was
  // saved (could be empty for very old rows but we don't care).
  const [intent, setIntent] = useState<Set<IntentKey>>(new Set(initial.intent || []));
  const [qrRevShare, setQrRevShare] = useState<string>(
    initial.qrRevenueSharePercent != null ? String(initial.qrRevenueSharePercent) : "20",
  );
  const [styles, setStyles] = useState((initial.styles || []).join(", "));
  const [mediums, setMediums] = useState((initial.mediums || []).join(", "));
  const [budgetMin, setBudgetMin] = useState(
    initial.budgetMinPence != null ? String(initial.budgetMinPence / 100) : "",
  );
  const [budgetMax, setBudgetMax] = useState(
    initial.budgetMaxPence != null ? String(initial.budgetMaxPence / 100) : "",
  );
  const [location, setLocation] = useState(initial.location || "");
  const [timescale, setTimescale] = useState<TimescaleKey | "">(initial.timescale || "");
  const [visibility, setVisibility] = useState<Visibility>(initial.visibility || "semi_public");
  const [invitedSlugsRaw, setInvitedSlugsRaw] = useState((initial.invitedArtistSlugs || []).map((s) => `@${s}`).join(", "));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleIntent(i: IntentKey) {
    setIntent((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!description.trim()) {
      setError("Description is required.");
      return;
    }
    if (intent.size === 0) {
      setError("Pick at least one intent.");
      return;
    }

    const invitedSlugs =
      visibility === "private"
        ? invitedSlugsRaw
            .split(/[\s,]+/)
            .map((s) => s.trim().replace(/^@/, "").toLowerCase())
            .filter(Boolean)
        : [];

    setSubmitting(true);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        intent: Array.from(intent),
        qrRevenueSharePercent: intent.has("display") && qrRevShare
          ? Math.max(0, Math.min(100, Math.round(parseFloat(qrRevShare))))
          : undefined,
        styles: styles.split(",").map((s) => s.trim()).filter(Boolean),
        mediums: mediums.split(",").map((s) => s.trim()).filter(Boolean),
        budgetMinPence: budgetMin ? Math.round(parseFloat(budgetMin) * 100) : undefined,
        budgetMaxPence: budgetMax ? Math.round(parseFloat(budgetMax) * 100) : undefined,
        location: location.trim() || undefined,
        timescale: timescale || undefined,
        visibility,
        invitedArtistSlugs: invitedSlugs,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const submitLabel = submitting
    ? mode === "create" ? "Posting…" : "Saving…"
    : mode === "create" ? "Post request" : "Save changes";

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label className="block text-xs uppercase tracking-wider text-muted mb-1.5" htmlFor="title">
          Title <Required />
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={160}
          placeholder="e.g. Statement piece for our reception wall"
          className="w-full px-3 py-2.5 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/60"
        />
      </div>

      <div>
        <label className="block text-xs uppercase tracking-wider text-muted mb-1.5" htmlFor="desc">
          What you&rsquo;re looking for <Required />
        </label>
        <textarea
          id="desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          maxLength={4000}
          placeholder="The space, the vibe, what you've tried, what you'd like."
          className="w-full px-3 py-2 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/60 resize-y"
        />
      </div>

      <div>
        <p className="block text-xs uppercase tracking-wider text-muted mb-2">
          I&rsquo;m open to <Required />
        </p>
        <div className="grid sm:grid-cols-2 gap-2">
          {INTENT_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => toggleIntent(opt.key)}
              className={`text-left p-3 rounded-sm border transition-colors ${
                intent.has(opt.key) ? "border-accent bg-accent/5" : "border-border hover:border-accent/40"
              }`}
            >
              <p className="text-sm font-medium">{opt.label}</p>
              <p className="text-[11px] text-muted leading-snug">{opt.hint}</p>
            </button>
          ))}
        </div>
      </div>

      {intent.has("display") && (
        <div>
          <label className="block text-xs uppercase tracking-wider text-muted mb-1.5" htmlFor="qrshare">
            Revenue share for the artist (%)
          </label>
          <div className="flex items-center gap-2">
            <input
              id="qrshare"
              type="number"
              min={0}
              max={100}
              step={1}
              value={qrRevShare}
              onChange={(e) => setQrRevShare(e.target.value)}
              className="w-32 px-3 py-2.5 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/60"
            />
            <span className="text-xs text-muted">% of QR sales paid to the artist.</span>
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs uppercase tracking-wider text-muted mb-1.5" htmlFor="styles">
            Styles <span className="normal-case text-muted/70">(comma separated)</span>
          </label>
          <input
            id="styles"
            type="text"
            value={styles}
            onChange={(e) => setStyles(e.target.value)}
            placeholder="abstract, minimalist"
            className="w-full px-3 py-2.5 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/60"
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider text-muted mb-1.5" htmlFor="mediums">
            Mediums
          </label>
          <input
            id="mediums"
            type="text"
            value={mediums}
            onChange={(e) => setMediums(e.target.value)}
            placeholder="oil, photography"
            className="w-full px-3 py-2.5 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/60"
          />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs uppercase tracking-wider text-muted mb-1.5" htmlFor="bmin">
            Budget min (£)
          </label>
          <input
            id="bmin"
            type="number"
            min="0"
            step="1"
            value={budgetMin}
            onChange={(e) => setBudgetMin(e.target.value)}
            className="w-full px-3 py-2.5 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/60"
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider text-muted mb-1.5" htmlFor="bmax">
            Budget max (£)
          </label>
          <input
            id="bmax"
            type="number"
            min="0"
            step="1"
            value={budgetMax}
            onChange={(e) => setBudgetMax(e.target.value)}
            className="w-full px-3 py-2.5 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/60"
          />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs uppercase tracking-wider text-muted mb-1.5" htmlFor="loc">
            Location
          </label>
          <input
            id="loc"
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="London, EC1"
            className="w-full px-3 py-2.5 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/60"
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider text-muted mb-1.5" htmlFor="ts">
            Timeline
          </label>
          <select
            id="ts"
            value={timescale}
            onChange={(e) => setTimescale(e.target.value as TimescaleKey | "")}
            className="w-full px-3 py-2.5 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/60"
          >
            <option value="">No preference</option>
            {TIMESCALE_OPTIONS.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <p className="block text-xs uppercase tracking-wider text-muted mb-2">
          Visibility <Required />
        </p>
        <div className="grid sm:grid-cols-2 gap-2">
          {(
            [
              { key: "semi_public", label: "Verified artists", desc: "Approved Wallplace artists can browse + respond." },
              { key: "private", label: "Private", desc: "Only artists you invite by handle." },
            ] as const
          ).map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => setVisibility(v.key)}
              className={`text-left p-3 rounded-sm border transition-colors ${
                visibility === v.key ? "border-accent bg-accent/5" : "border-border hover:border-accent/40"
              }`}
            >
              <p className="text-sm font-medium">{v.label}</p>
              <p className="text-[11px] text-muted">{v.desc}</p>
            </button>
          ))}
        </div>
        {visibility === "private" && (
          <div className="mt-3">
            <label className="block text-xs uppercase tracking-wider text-muted mb-1.5" htmlFor="invited">
              Invite artists <span className="normal-case text-muted/70">(comma or space separated handles)</span>
            </label>
            <input
              id="invited"
              type="text"
              value={invitedSlugsRaw}
              onChange={(e) => setInvitedSlugsRaw(e.target.value)}
              placeholder="@maya-chen, @oliver-grant"
              className="w-full px-3 py-2.5 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/60"
            />
            <p className="text-[11px] text-muted mt-1">
              Use the artist&rsquo;s Wallplace handle (slug). Only invited artists will see this request.
            </p>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 px-5 py-3 text-sm font-medium text-white bg-accent hover:bg-accent/90 rounded-sm transition-colors disabled:opacity-60"
        >
          {submitLabel}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-3 text-sm text-muted hover:text-foreground transition-colors">
          Cancel
        </button>
      </div>
    </form>
  );
}
