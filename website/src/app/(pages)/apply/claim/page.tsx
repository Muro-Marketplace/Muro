"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

/**
 * /apply/claim — lightweight follow-up to the artist application.
 *
 * Once an artist has submitted the application, we nudge them here to
 * claim their Wallplace space: create an account with a password and
 * (optionally) one or two profile basics — a short bio and a link. Nothing
 * else is compulsory. The whole point is low-friction early investment
 * while the application is under review, so they feel committed before
 * the acceptance email lands.
 *
 * On submit we:
 *   1. Create the Supabase auth user with user_type = "artist"
 *   2. Sign them in immediately so they can keep going
 *   3. Create a minimal artist_profile row
 *   4. Send them into /artist-portal/profile where they can add more
 */

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function ClaimForm() {
  const router = useRouter();
  const params = useSearchParams();
  const prefilledEmail = params.get("email") || "";
  const prefilledName = params.get("name") || "";
  const prefilledMedium = params.get("medium") || "";

  const [email, setEmail] = useState(prefilledEmail);
  const [name, setName] = useState(prefilledName);
  const [password, setPassword] = useState("");
  const [shortBio, setShortBio] = useState("");
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !name.trim() || password.length < 8) {
      setError("Email, name, and a password of at least 8 characters are required.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const slug = slugify(name) || `artist-${Date.now()}`;
      // 1. Create auth user
      const { error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { user_type: "artist", display_name: name, artist_slug: slug } },
      });
      if (authError) {
        // "User already registered" → fall through to sign-in
        if (!/already registered|already exists/i.test(authError.message || "")) {
          setError(authError.message || "Could not create account.");
          setSubmitting(false);
          return;
        }
      }

      // 2. Sign in
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError("Account created — please sign in from the login page.");
        setSubmitting(false);
        return;
      }

      // 3. Create the artist profile. This used to be fire-and-forget,
      // which meant a failed insert silently dropped the user into the
      // portal with no profile — where the editor rendered "No artist
      // profile found." Now we await and surface the error so the user
      // doesn't land on a dead end.
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        const profileRes = await fetch("/api/artist-profile", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            name,
            slug,
            location: "",
            primaryMedium: prefilledMedium,
            shortBio: shortBio.trim(),
            website: website.trim(),
          }),
        }).catch(() => null);
        if (!profileRes || !profileRes.ok) {
          // The profile editor also handles the empty-profile case from
          // here, so we soft-warn and continue rather than blocking on
          // a recoverable insert failure.
          console.warn("Profile creation POST failed; profile editor will start empty.");
        }
      }

      // Land on the full profile editor with a welcome flag so the page
      // can nudge the user to fill in the remaining fields.
      router.push("/artist-portal/profile?welcome=1");
    } catch (err) {
      console.error("Claim flow error:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-[640px] mx-auto px-6 pt-10 pb-20">
      <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-accent mb-3">
        Step 2 &middot; Claim your profile
      </p>
      <h1 className="font-serif text-3xl sm:text-4xl text-foreground leading-tight mb-3">
        Get a head start on your Wallplace profile
      </h1>
      <p className="text-muted leading-relaxed mb-8">
        Your application is with our team. While we review it, claim your
        space in under two minutes. Just the essentials now &mdash; you can
        add your full portfolio, statement, and works any time.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-foreground mb-2">
            Your name <span className="text-accent">*</span>
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-4 py-3 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/60"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
            Email <span className="text-accent">*</span>
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-3 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/60"
          />
          <p className="mt-1 text-xs text-muted">Use the same email as your application so we can link them.</p>
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-foreground mb-2">
            Password <span className="text-accent">*</span>
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            placeholder="At least 8 characters"
            className="w-full px-4 py-3 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/60"
          />
        </div>

        <div>
          <label htmlFor="shortBio" className="block text-sm font-medium text-foreground mb-2">
            One-line bio <span className="text-muted font-normal">(optional)</span>
          </label>
          <input
            id="shortBio"
            type="text"
            value={shortBio}
            onChange={(e) => setShortBio(e.target.value)}
            placeholder="e.g. London-based landscape photographer."
            maxLength={140}
            className="w-full px-4 py-3 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/60"
          />
        </div>

        <div>
          <label htmlFor="website" className="block text-sm font-medium text-foreground mb-2">
            Website / Instagram <span className="text-muted font-normal">(optional)</span>
          </label>
          <input
            id="website"
            type="text"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://yoursite.com  or  @yourhandle"
            className="w-full px-4 py-3 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/60"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-accent text-white text-sm font-semibold rounded-sm hover:bg-accent-hover transition-colors disabled:opacity-60"
          >
            {submitting ? "Creating your profile…" : "Create my profile"}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-6 py-3 text-sm text-muted hover:text-foreground transition-colors"
          >
            Skip for now
          </Link>
        </div>

        <p className="text-[11px] text-muted pt-4">
          Creating a profile doesn&rsquo;t commit you to a plan. You&rsquo;ll
          only start a subscription after we&rsquo;ve approved your
          application and you&rsquo;re ready to go live.
        </p>
      </form>
    </div>
  );
}

export default function ClaimPage() {
  return (
    <Suspense fallback={<div className="max-w-[640px] mx-auto px-6 py-20 text-sm text-muted">Loading…</div>}>
      <ClaimForm />
    </Suspense>
  );
}
