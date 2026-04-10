"use client";

import { useState } from "react";

export default function ContactForm() {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get("name") as string,
      email: formData.get("email") as string,
      type: formData.get("type") as string,
      message: formData.get("message") as string,
    };

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await res.json();

      if (!res.ok) {
        setError(result.error || "Something went wrong");
        setSubmitting(false);
        return;
      }

      setSubmitted(true);
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="bg-surface border border-border rounded-sm p-10 text-center">
        <div className="w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h3 className="text-xl mb-2">Message Sent</h3>
        <p className="text-sm text-muted">Thanks for reaching out. We respond within 24 hours.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-foreground mb-2">Name</label>
        <input type="text" id="name" name="name" required className="w-full px-4 py-3 bg-surface border border-border rounded-sm text-sm text-foreground placeholder:text-muted/50 focus:outline-none focus:border-accent transition-colors duration-200" placeholder="Your name" />
      </div>
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">Email</label>
        <input type="email" id="email" name="email" required className="w-full px-4 py-3 bg-surface border border-border rounded-sm text-sm text-foreground placeholder:text-muted/50 focus:outline-none focus:border-accent transition-colors duration-200" placeholder="you@example.com" />
      </div>
      <div>
        <label htmlFor="type" className="block text-sm font-medium text-foreground mb-2">I am a...</label>
        <select id="type" name="type" required className="w-full px-4 py-3 bg-surface border border-border rounded-sm text-sm text-foreground focus:outline-none focus:border-accent transition-colors duration-200 appearance-none" defaultValue="">
          <option value="" disabled>Select one</option>
          <option value="artist">Artist</option>
          <option value="venue">Venue</option>
          <option value="buyer">Buyer</option>
          <option value="commercial">Commercial Enquiry</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div>
        <label htmlFor="message" className="block text-sm font-medium text-foreground mb-2">Message</label>
        <textarea id="message" name="message" required rows={5} className="w-full px-4 py-3 bg-surface border border-border rounded-sm text-sm text-foreground placeholder:text-muted/50 focus:outline-none focus:border-accent transition-colors duration-200 resize-vertical" placeholder="Tell us what you're looking for..." />
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full inline-flex items-center justify-center px-6 py-3 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent-hover transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? "Sending..." : "Send Message"}
      </button>
    </form>
  );
}
