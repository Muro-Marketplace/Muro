"use client";

// Phase 2.5 (B1/B2/B3). Modal shown when an API call hits a paywall
// (HTTP 402 with `{ error: "subscription_required" }`). Linkable for
// in-place affordances ("Upgrade to publish") and dismissible.

import Link from "next/link";

interface UpgradePromptProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
  upgradeUrl?: string;
}

const DEFAULT_TITLE = "Upgrade to continue";
const DEFAULT_MESSAGE =
  "This action is part of the paid Wallplace plan. Upgrade your subscription and you're back in.";
const DEFAULT_UPGRADE_URL = "/artist-portal/billing";

export default function UpgradePrompt({
  open,
  onClose,
  title = DEFAULT_TITLE,
  message = DEFAULT_MESSAGE,
  upgradeUrl = DEFAULT_UPGRADE_URL,
}: UpgradePromptProps) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-prompt-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="bg-surface w-full max-w-md rounded-sm border border-border shadow-lg overflow-hidden">
        <div className="px-6 pt-6 pb-2">
          <h2 id="upgrade-prompt-title" className="text-xl font-medium">
            {title}
          </h2>
          <p className="text-sm text-muted mt-2 leading-relaxed">{message}</p>
        </div>
        <div className="px-6 py-5 flex flex-wrap justify-end gap-2 bg-background/40 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-sm border border-border hover:border-accent/40"
          >
            Not now
          </button>
          <Link
            href={upgradeUrl}
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-sm bg-accent text-white hover:bg-accent-hover"
          >
            See plans
          </Link>
        </div>
      </div>
    </div>
  );
}
