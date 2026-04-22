"use client";

import { useState } from "react";

interface NewsletterFormProps {
  source?: string;
  className?: string;
}

/**
 * Compact email-only subscribe form. Posts to /api/newsletter.
 * Shows inline success / error states; no toast system dependency.
 */
export default function NewsletterForm({ source = "footer", className = "" }: NewsletterFormProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string>("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), source }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        setMessage(body?.error || "Could not subscribe — please try again.");
        return;
      }
      setStatus("success");
      setMessage(body?.alreadySubscribed ? "You're already subscribed." : "Thanks — you're on the list.");
      setEmail("");
    } catch {
      setStatus("error");
      setMessage("Network error — please try again.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className={`flex flex-col gap-2 ${className}`}>
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          required
          className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-sm focus:outline-none focus:border-accent/60 text-foreground placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-sm transition-colors disabled:opacity-50"
        >
          {status === "loading" ? "…" : "Subscribe"}
        </button>
      </div>
      {message && (
        <p className={`text-xs ${status === "success" ? "text-green-600" : "text-red-600"}`}>{message}</p>
      )}
    </form>
  );
}
