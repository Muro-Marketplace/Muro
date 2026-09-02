"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { signupDestination } from "@/lib/signup-destination";
import { slugify } from "@/lib/slugify";
import { safeRedirect } from "@/lib/safe-redirect";
import { TERMS_VERSION } from "@/lib/terms-version";
import TermsCheckbox from "@/components/TermsCheckbox";
import Dropdown from "@/components/Dropdown";
import RedirectIfLoggedIn from "@/components/RedirectIfLoggedIn";
import Turnstile from "@/components/Turnstile";

const venueTypes = [
  "Café / Coffee Shop",
  "Restaurant / Bar",
  "Hotel / Hospitality",
  "Office / Coworking",
  "Retail / Boutique",
  "Salon / Wellness",
  "Events Space",
  "Other",
];

const wallSpaceOptions = [
  "1 to 3 walls (small café / studio)",
  "4 to 8 walls (restaurant / office floor)",
  "9+ walls (hotel / large venue)",
];

const artInterests = [
  "Photography",
  "Paintings",
  "Prints & Illustrations",
  "Mixed Media",
  "Abstract & Contemporary",
  "Landscapes & Nature",
  "Black & White",
  "Bold & Colourful",
];

const hearOptions = [
  "Google / Web search",
  "Instagram",
  "Word of mouth",
  "An artist recommended us",
  "Event or exhibition",
  "Other",
];

interface VenueFormState {
  venueName: string;
  contactName: string;
  email: string;
  phone: string;
  venueType: string;
  customVenueType: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postcode: string;
  wallSpace: string;
  artInterests: string[];
  message: string;
  hearAbout: string;
  password: string;
  confirmPassword: string;
}

const initialState: VenueFormState = {
  venueName: "",
  contactName: "",
  email: "",
  phone: "",
  venueType: "",
  customVenueType: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  postcode: "",
  wallSpace: "",
  artInterests: [],
  message: "",
  hearAbout: "",
  password: "",
  confirmPassword: "",
};

export default function RegisterVenuePage() {
  const router = useRouter();
  const [form, setForm] = useState(initialState);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [agreedToTos, setAgreedToTos] = useState(false);
  const [agreedToVenueTerms, setAgreedToVenueTerms] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  // Read ?next= so a deep-link funnel survives the email-verification hop.
  const inboundNext =
    typeof window === "undefined"
      ? ""
      : new URLSearchParams(window.location.search).get("next") ?? "";
  const postSignupNext = safeRedirect(inboundNext, "/venue-portal");

  function updateField(field: keyof VenueFormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function toggleInterest(interest: string) {
    setForm((prev) => ({
      ...prev,
      artInterests: prev.artInterests.includes(interest)
        ? prev.artInterests.filter((i) => i !== interest)
        : [...prev.artInterests, interest],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    if (form.password.length < 8) {
      setError("Password must be at least 8 characters");
      setSubmitting(false);
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match");
      setSubmitting(false);
      return;
    }

    if (!turnstileToken) {
      setError("Please complete the verification challenge.");
      setSubmitting(false);
      return;
    }

    try {
      const verifyRes = await fetch("/api/auth/verify-turnstile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: turnstileToken }),
      });
      const verifyData = (await verifyRes.json().catch(() => ({}))) as { ok?: boolean };
      if (!verifyRes.ok || !verifyData.ok) {
        setError("Verification failed. Refresh and try again.");
        setSubmitting(false);
        return;
      }

      // Persist the registration record. The venue profile itself is created
      // on the first verified login (ensureVenueProfile), hydrated from this
      // record via the confirmed email. E34: the slug used to be computed here
      // and sent along, which made it a value the browser chose.
      const regRes = await fetch("/api/register-venue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!regRes.ok) {
        const data = await regRes.json().catch(() => ({}));
        setError(data.error || "Could not create your venue. Please try again.");
        setSubmitting(false);
        return;
      }

      // Create auth account
      const { data: signUpData, error: authError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          // E34: `venue_slug` used to ride along here and the server treated it
          // as proof of ownership. Nothing reads it now, and it must not come
          // back: a value written with the anon key is the claimant's choice,
          // not evidence.
          data: { user_type: "venue", display_name: form.contactName },
          emailRedirectTo: `${window.location.origin}/login?next=${encodeURIComponent(postSignupNext)}`,
        },
      });

      if (authError) {
        setError(authError.message || "Could not create account. Please try again.");
        setSubmitting(false);
        return;
      }

      // Terms (fire-and-forget, both flavours)
      const termsPayload = {
        userEmail: form.email,
        userType: "venue",
        termsVersion: TERMS_VERSION,
      };
      fetch("/api/terms/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...termsPayload, termsType: "platform_tos" }),
      }).catch(() => {});
      fetch("/api/terms/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...termsPayload, termsType: "venue_agreement" }),
      }).catch(() => {});

      // A L447/A L458: was unconditional. Supabase returns a session only
      // when email confirmation is off, in which case the account is already
      // signed in and the inbox page is untrue. See lib/signup-destination.ts.
      router.push(signupDestination(signUpData, postSignupNext));
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full bg-background border border-border rounded-sm px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/60 transition-colors";

  if (submitted) {
    return (
      <div className="bg-background min-h-screen">
        <div className="max-w-2xl mx-auto px-6 py-24 text-center">
          <div className="w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-6">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#C17C5A" strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <h1 className="text-3xl font-serif mb-3">You&rsquo;re In</h1>
          <p className="text-muted leading-relaxed mb-2">
            Welcome to Wallplace, {form.contactName}. Your venue <strong>{form.venueName}</strong> is set up and ready to go.
          </p>
          <p className="text-muted leading-relaxed mb-8">
            Start browsing artist portfolios and find the perfect work for your space.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/browse" className="inline-flex items-center justify-center px-6 py-3 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent-hover transition-colors">
              Browse Art
            </Link>
            <Link href="/venue-portal" className="inline-flex items-center justify-center px-6 py-3 border border-border text-foreground text-sm font-medium rounded-sm hover:bg-surface transition-colors">
              Go to Your Portal
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <RedirectIfLoggedIn>
    <div className="bg-background">
      {/* Hero */}
      <section className="py-20 lg:py-24 bg-foreground text-white">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="max-w-2xl">
            <p className="text-xs font-medium tracking-[0.2em] uppercase text-accent mb-4">For Venues</p>
            <h1 className="text-4xl lg:text-5xl font-serif mb-4 text-white">Register Your Venue</h1>
            <p className="text-lg text-white/60 leading-relaxed">
              Tell us about your space and we&rsquo;ll match you with artists whose work fits your environment. Completely free, no contracts, no commitments.
            </p>
            <p className="mt-5 text-sm text-white/50">
              Want us to do the curation for you?{" "}
              <Link href="/curated" className="text-white underline underline-offset-2 hover:text-white/80">
                Wallplace Curated
              </Link>
              , paid shortlists from £49.
            </p>
          </div>
        </div>
      </section>

      {/* Form */}
      <section className="py-16 lg:py-20">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-12 lg:gap-16">
            {/* Sidebar */}
            <div className="lg:sticky lg:top-28 lg:self-start">
              <h2 className="text-2xl font-serif mb-5">What happens next</h2>
              <div className="space-y-4">
                {[
                  { step: "01", title: "Create your account", desc: "Register and start browsing immediately. No waiting." },
                  { step: "02", title: "Browse & connect", desc: "Explore artist portfolios and enquire about work you love." },
                  { step: "03", title: "Agree & display", desc: "Arrange terms directly with the artist and start displaying." },
                ].map((s) => (
                  <div key={s.step} className="flex gap-4">
                    <span className="text-accent text-sm font-medium mt-0.5">{s.step}</span>
                    <div>
                      <p className="text-sm font-medium">{s.title}</p>
                      <p className="text-xs text-muted mt-0.5">{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-8 bg-accent/5 border border-accent/20 rounded-sm p-4">
                <p className="text-sm font-medium text-foreground mb-1">It&rsquo;s free</p>
                <p className="text-xs text-muted leading-relaxed">
                  No cost to display artwork. No contracts. 30 days&rsquo; notice to end at any time.
                </p>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Venue Details */}
              <div>
                <h3 className="text-xl mb-6 pb-4 border-b border-border">Your Venue</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-medium mb-2">Venue Name <span className="text-accent">*</span></label>
                    <input type="text" value={form.venueName} onChange={(e) => updateField("venueName", e.target.value)} required placeholder="e.g. The Copper Kettle" className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Venue Type <span className="text-accent">*</span></label>
                    <Dropdown
                      value={form.venueType}
                      onChange={(v) => updateField("venueType", v)}
                      options={venueTypes.map((t) => ({ value: t, label: t }))}
                      placeholder="Select type"
                      required
                      ariaLabel="Venue type"
                    />
                    {form.venueType === "Other" && (
                      <input
                        type="text"
                        value={form.customVenueType || ""}
                        onChange={(e) => updateField("customVenueType", e.target.value)}
                        placeholder="Please describe your venue type"
                        className={`${inputClass} mt-2`}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Contact */}
              <div>
                <h3 className="text-xl mb-6 pb-4 border-b border-border">Contact Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-medium mb-2">Your Name <span className="text-accent">*</span></label>
                    <input type="text" value={form.contactName} onChange={(e) => updateField("contactName", e.target.value)} required placeholder="Full name" className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Email <span className="text-accent">*</span></label>
                    <input type="email" value={form.email} onChange={(e) => updateField("email", e.target.value)} required placeholder="you@venue.com" className={inputClass} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium mb-2">Phone</label>
                    <input type="tel" value={form.phone} onChange={(e) => updateField("phone", e.target.value)} placeholder="Optional" className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Password <span className="text-accent">*</span></label>
                    <input type="password" value={form.password} onChange={(e) => updateField("password", e.target.value)} required minLength={8} placeholder="At least 8 characters" className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Confirm Password <span className="text-accent">*</span></label>
                    <input type="password" value={form.confirmPassword} onChange={(e) => updateField("confirmPassword", e.target.value)} required placeholder="Confirm your password" className={inputClass} />
                  </div>
                </div>
              </div>

              {/* Address */}
              <div>
                <h3 className="text-xl mb-6 pb-4 border-b border-border">Venue Address</h3>
                <div className="space-y-4">
                  <input type="text" value={form.addressLine1} onChange={(e) => updateField("addressLine1", e.target.value)} required placeholder="Address line 1 *" className={inputClass} />
                  <input type="text" value={form.addressLine2} onChange={(e) => updateField("addressLine2", e.target.value)} placeholder="Address line 2" className={inputClass} />
                  <div className="grid grid-cols-2 gap-4">
                    <input type="text" value={form.city} onChange={(e) => updateField("city", e.target.value)} required placeholder="City *" className={inputClass} />
                    <input type="text" value={form.postcode} onChange={(e) => updateField("postcode", e.target.value)} required placeholder="Postcode *" className={inputClass} />
                  </div>
                </div>
              </div>

              {/* Space & Preferences */}
              <div>
                <h3 className="text-xl mb-6 pb-4 border-b border-border">Your Space</h3>
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium mb-2">Approximate wall space <span className="text-accent">*</span></label>
                    <Dropdown
                      value={form.wallSpace}
                      onChange={(v) => updateField("wallSpace", v)}
                      options={wallSpaceOptions.map((o) => ({ value: o, label: o }))}
                      placeholder="Select"
                      required
                      ariaLabel="Approximate wall space"
                    />
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-3">What kind of art interests you?</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {artInterests.map((interest) => (
                        <button
                          key={interest}
                          type="button"
                          onClick={() => toggleInterest(interest)}
                          className={`px-3 py-2 text-xs rounded-sm border transition-colors ${
                            form.artInterests.includes(interest)
                              ? "bg-accent text-white border-accent"
                              : "border-border text-muted hover:border-accent/30"
                          }`}
                        >
                          {interest}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Anything else you&rsquo;d like us to know?</label>
                    <textarea value={form.message} onChange={(e) => updateField("message", e.target.value)} rows={3} placeholder="Tell us about your space, your style, or what you're looking for..." className={`${inputClass} resize-none`} />
                  </div>
                </div>
              </div>

              {/* How did you hear */}
              <div>
                <label className="block text-sm font-medium mb-2">How did you hear about Wallplace?</label>
                <Dropdown
                  value={form.hearAbout}
                  onChange={(v) => updateField("hearAbout", v)}
                  options={hearOptions.map((o) => ({ value: o, label: o }))}
                  placeholder="Select"
                  ariaLabel="How did you hear about Wallplace"
                />
              </div>

              {/* Error */}
              {error && <p className="text-red-500 text-sm">{error}</p>}

              {/* Terms */}
              <div className="space-y-3">
                <TermsCheckbox
                  termsType="platform_tos"
                  checked={agreedToTos}
                  onChange={setAgreedToTos}
                  required
                />
                <TermsCheckbox
                  termsType="venue_agreement"
                  checked={agreedToVenueTerms}
                  onChange={setAgreedToVenueTerms}
                  required
                />
                <p className="text-xs text-muted">
                  The agreement covers care of artwork and your insurance position. You confirm cover for each piece when a placement is recorded, not now.
                </p>
              </div>

              <div className="pt-2">
                <Turnstile onVerify={setTurnstileToken} onExpire={() => setTurnstileToken(null)} />
              </div>

              {/* Submit */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting || !agreedToTos || !agreedToVenueTerms || !turnstileToken}
                  className="px-8 py-3.5 bg-accent text-white text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? "Registering..." : "Register Your Venue"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>
    </div>
    </RedirectIfLoggedIn>
  );
}
