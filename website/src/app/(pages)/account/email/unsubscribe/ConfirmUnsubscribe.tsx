"use client";

// QA flag C24 follow-through. The page used to APPLY the unsubscribe during
// the server render, which meant any mail-client link scanner that prefetched
// the URL unsubscribed the reader without a click. The preference now changes
// only when a human presses the button; the API endpoint keeps handling the
// RFC 8058 one-click POST that mail clients send headerside.

import { useState } from "react";

export default function ConfirmUnsubscribe({
  userId,
  category,
  label,
}: {
  userId: string;
  category: string;
  label: string;
}) {
  const [state, setState] = useState<"idle" | "working" | "done" | "failed">("idle");

  async function confirm() {
    setState("working");
    try {
      const res = await fetch(
        `/api/account/email/unsubscribe?u=${encodeURIComponent(userId)}&c=${encodeURIComponent(category)}`,
        { method: "POST" },
      );
      setState(res.ok ? "done" : "failed");
    } catch {
      setState("failed");
    }
  }

  if (state === "done") {
    return (
      <p className="text-muted leading-relaxed mb-6">
        You&rsquo;ve been unsubscribed from {label.toLowerCase()}. We won&rsquo;t send you any
        more of those emails. Critical messages about orders, security, and legal notices
        will still come through, you can&rsquo;t turn those off.
      </p>
    );
  }
  if (state === "failed") {
    return (
      <p className="text-muted leading-relaxed mb-6">
        Something went wrong saving your preference. Please try again, or contact{" "}
        <a href="mailto:hello@wallplace.co.uk" className="text-accent hover:underline">
          hello@wallplace.co.uk
        </a>
        .
      </p>
    );
  }
  return (
    <div className="mb-6">
      <p className="text-muted leading-relaxed mb-6">
        Stop receiving {label.toLowerCase()} from Wallplace? You can switch them back on any
        time from your email preferences.
      </p>
      <button
        type="button"
        onClick={confirm}
        disabled={state === "working"}
        className="px-5 py-2.5 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-sm transition-colors disabled:opacity-60"
      >
        {state === "working" ? "Unsubscribing…" : "Unsubscribe"}
      </button>
    </div>
  );
}
