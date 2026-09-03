"use client";

/**
 * ProposalSendPanel, the Send step inside the preview modal when an artist
 * is laying work out on a venue's wall (`artist_venue_wall`).
 *
 * Three states, all owned here except the sending itself:
 *   - a strip with one button, "Send to {venue}", which opens
 *   - a compact request: the arrangement (only what the venue is open to,
 *     derived exactly as the Spaces request form does), the revenue share
 *     or monthly fee for it, and a message prefilled for this wall, then
 *   - the sent state, with the way back to My Placements or the venue.
 *
 * The parent does the sending (it holds the capture and the items) and
 * reports progress through `status` and `error`. Server refusals arrive in
 * `error` word for word.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { ARRANGEMENT_LABEL } from "@/lib/arrangement-labels";
import { PAID_LOAN_MIN_GBP } from "@/lib/pricing";
import {
  DEFAULT_MONTHLY_FEE_GBP,
  DEFAULT_REVENUE_SHARE_PERCENT,
  PROPOSAL_MESSAGE_MAX,
  clampRevenueShare,
  defaultProposalMessage,
  proposalTermsProblem,
  supportedArrangements,
  type ProposalArrangement,
  type ProposalTerms,
  type ProposalVenue,
} from "@/lib/placements/wall-proposal-client";

export type ProposalSendStatus = "idle" | "sending" | "sent" | "error";

export interface ProposalSendPanelProps {
  venue: ProposalVenue;
  wallName: string;
  status: ProposalSendStatus;
  error: string | null;
  onSend: (terms: ProposalTerms) => void;
}

const ARRANGEMENT_COPY: Record<ProposalArrangement, string> = {
  revenue_share: ARRANGEMENT_LABEL.revenue_share,
  loan: ARRANGEMENT_LABEL.paid_loan,
  purchase: ARRANGEMENT_LABEL.purchase,
};

const INPUT =
  "px-2.5 py-1.5 text-sm border border-stone-300 rounded-md bg-white focus:outline-none focus:border-stone-500";

export default function ProposalSendPanel({
  venue,
  wallName,
  status,
  error,
  onSend,
}: ProposalSendPanelProps) {
  const supported = useMemo(() => supportedArrangements(venue), [venue]);
  const [open, setOpen] = useState(false);
  const [arrangement, setArrangement] = useState<ProposalArrangement>(
    () => supported[0] ?? "revenue_share",
  );
  const [revenueShare, setRevenueShare] = useState(DEFAULT_REVENUE_SHARE_PERCENT);
  const [monthlyFee, setMonthlyFee] = useState(DEFAULT_MONTHLY_FEE_GBP);
  const [message, setMessage] = useState(() => defaultProposalMessage(venue.name, wallName));
  const [problem, setProblem] = useState<string | null>(null);

  const sending = status === "sending";

  function submit() {
    if (sending) return;
    const terms: ProposalTerms = {
      arrangement,
      revenueSharePercent: revenueShare,
      monthlyFeeGbp: monthlyFee,
      message,
    };
    const next = proposalTermsProblem(terms);
    setProblem(next);
    if (next) return;
    onSend(terms);
  }

  if (status === "sent") {
    return (
      <div
        role="status"
        className="rounded-xl bg-white/95 text-stone-900 px-4 py-4 shadow-lg flex flex-wrap items-center gap-3"
      >
        <div className="text-sm flex-1 min-w-[12rem]">
          <p className="font-medium text-stone-900">Sent to {venue.name}</p>
          <p className="text-xs text-stone-500 leading-snug">
            They&rsquo;ll see this picture with your request. We&rsquo;ll let you know when they respond.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/artist-portal/placements"
            className="text-xs font-medium px-3 py-1.5 rounded-full bg-stone-900 text-white hover:bg-stone-800"
          >
            View My Placements
          </Link>
          <Link
            href={`/venues/${encodeURIComponent(venue.slug)}`}
            className="text-xs font-medium px-3 py-1.5 rounded-full border border-stone-300 text-stone-700 hover:bg-stone-100"
          >
            Back to {venue.name}
          </Link>
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="rounded-xl bg-white/95 text-stone-900 px-4 py-3 shadow-lg flex flex-wrap items-center gap-3">
        <div className="text-xs flex-1 min-w-[10rem]">
          <p className="font-medium text-stone-900">
            Happy with it? Send this picture to {venue.name} with a placement request.
          </p>
          <p className="text-stone-500 leading-snug">
            They see the wall exactly as you laid it out.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs font-medium px-3 py-1.5 rounded-full bg-stone-900 text-white hover:bg-stone-800"
        >
          Send to {venue.name}
        </button>
      </div>
    );
  }

  const shownError = problem ?? (status === "error" ? error : null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      aria-label={`Send to ${venue.name}`}
      className="rounded-xl bg-white/95 text-stone-900 px-4 py-4 shadow-lg space-y-3"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-stone-900">Send to {venue.name}</p>
        <p className="text-[11px] text-stone-500">Your &ldquo;{wallName}&rdquo; wall proposal</p>
      </div>

      {supported.length === 0 ? (
        <p className="text-xs text-stone-600">
          {venue.name} isn&rsquo;t open to placement requests right now.
        </p>
      ) : (
        <>
          <fieldset className="space-y-1.5">
            <legend className="text-[10px] text-stone-500 uppercase tracking-wider mb-1">
              Proposed arrangement
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {supported.map((option) => {
                const active = arrangement === option;
                return (
                  <label
                    key={option}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border cursor-pointer ${
                      active
                        ? "border-stone-900 bg-stone-900 text-white"
                        : "border-stone-300 text-stone-700 hover:border-stone-500"
                    }`}
                  >
                    <input
                      type="radio"
                      name="proposal-arrangement"
                      value={option}
                      checked={active}
                      onChange={() => setArrangement(option)}
                      disabled={sending}
                      className="sr-only"
                    />
                    {ARRANGEMENT_COPY[option]}
                  </label>
                );
              })}
            </div>
          </fieldset>

          {arrangement === "revenue_share" && (
            <label className="flex items-center gap-2 text-xs text-stone-600">
              <span className="w-40">Revenue share to venue</span>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={revenueShare}
                onChange={(e) => setRevenueShare(clampRevenueShare(Number(e.target.value) || 0))}
                disabled={sending}
                aria-label="Revenue share to venue"
                className={`w-20 ${INPUT}`}
              />
              <span>% of sales from the wall</span>
            </label>
          )}

          {arrangement === "loan" && (
            <div className="space-y-1">
              <label className="flex items-center gap-2 text-xs text-stone-600">
                <span className="w-40">Monthly fee from venue</span>
                <span>&pound;</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={monthlyFee}
                  onChange={(e) => setMonthlyFee(Math.max(0, Number(e.target.value) || 0))}
                  disabled={sending}
                  aria-label="Monthly fee from venue"
                  className={`w-24 ${INPUT}`}
                />
                <span>per month</span>
              </label>
              <p className="text-[11px] text-stone-500">
                Monthly loan fees start at &pound;{PAID_LOAN_MIN_GBP}. Set 0 for a free loan.
              </p>
            </div>
          )}

          <label className="block text-xs text-stone-600">
            <span className="block mb-1">
              Message{" "}
              <span className="text-stone-400">
                ({message.trim().length}/{PROPOSAL_MESSAGE_MAX})
              </span>
            </span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, PROPOSAL_MESSAGE_MAX))}
              rows={3}
              disabled={sending}
              aria-label={`Message to ${venue.name}`}
              className={`w-full ${INPUT} resize-none`}
            />
          </label>
        </>
      )}

      {shownError && (
        <p role="alert" className="text-xs text-red-600">
          {shownError}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={sending}
          className="text-xs px-3 py-1.5 rounded-full text-stone-600 hover:text-stone-900 disabled:opacity-50"
        >
          Back
        </button>
        {supported.length > 0 && (
          <button
            type="submit"
            disabled={sending}
            className="text-xs font-medium px-3 py-1.5 rounded-full bg-stone-900 text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send"}
          </button>
        )}
      </div>
    </form>
  );
}
