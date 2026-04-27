"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import TermsCheckbox from "@/components/TermsCheckbox";
import { useAuth } from "@/context/AuthContext";
import { DISCIPLINES, formatSubStyleLabel, getDisciplineById, type DisciplineId } from "@/data/categories";

const primaryMediums = [
  "Oil Painting",
  "Watercolour",
  "Acrylic Painting",
  "Drawing & Illustration",
  "Street Photography",
  "Landscape Photography",
  "Portrait Photography",
  "Documentary Photography",
  "Fine Art Photography",
  "Abstract Photography",
  "Architectural Photography",
  "Still Life Photography",
  "Printmaking",
  "Mixed Media",
  "Collage",
  "Digital Art",
  "Sculpture",
  "Textile Art",
  "Other",
];

const deliveryRadiusOptions = [
  "Within 5 miles",
  "Within 10 miles",
  "Within 15 miles",
  "Central London only",
  "Greater London",
  "London + South East",
  "Nationwide",
];

const venueTypes = [
  "Cafes & Coffee Shops",
  "Restaurants & Bars",
  "Hotels & Hospitality",
  "Coworking Spaces",
  "Offices & Corporate",
  "Retail & Boutiques",
  "Creative Studios",
  "Events Spaces",
  "Healthcare & Wellness",
  "Any venue type",
];

const themeOptions = [
  "Abstract & Experimental",
  "Urban Life & Streets",
  "Nature & Landscape",
  "Architecture & Geometry",
  "Community & People",
  "Still Life & Objects",
  "Identity & Portraiture",
  "Calm & Contemplation",
  "Food & Abundance",
  "Travel & Place",
  "Black & White",
  "Colour & Atmosphere",
];

const hearAboutOptions = [
  "Instagram",
  "Google / Web Search",
  "Word of mouth",
  "Another artist",
  "Event or exhibition",
  "Press or media",
  "Other",
];

const planOptions = [
  {
    id: "core",
    name: "Core",
    price: "£9.99",
    fee: "15% platform fee",
    description: "Up to 8 works, standard profile, basic analytics.",
  },
  {
    id: "premium",
    name: "Premium",
    price: "£24.99",
    fee: "8% platform fee",
    description: "Up to 20 works, featured profile, message venues, full analytics.",
    popular: true as const,
  },
  {
    id: "pro",
    name: "Pro",
    price: "£49.99",
    fee: "5% platform fee",
    description: "Unlimited works, premium profile, message venues, dedicated support.",
  },
];

type TraderStatus = "" | "consumer" | "business";

interface FormState {
  name: string;
  email: string;
  location: string;
  instagram: string;
  traderStatus: TraderStatus;
  businessName: string;
  vatNumber: string;
  primaryMedium: string;
  discipline: DisciplineId | "";
  subStyles: string[];
  portfolioLink: string;
  artistStatement: string;
  offersOriginals: boolean;
  offersPrints: boolean;
  offersFramed: boolean;
  offersCommissions: boolean;
  openToFreeLoan: boolean;
  openToRevenueShare: boolean;
  openToPurchase: boolean;
  deliveryRadius: string;
  venueTypes: string[];
  themes: string[];
  hearAbout: string;
  selectedPlan: string;
  referralCode: string;
  /** Up to 3 publicly-accessible image URLs for artists who don't have
      a portfolio site or socials to link. Optional — the proper
      portfolio gets built on the artist profile after the application
      is accepted. Stored as a single comma-separated string in the
      `portfolio_link` DB field for now (alongside the main link)
      until we add a dedicated samples column. */
  sampleWorkUrls: string[];
}

const initialState: FormState = {
  name: "",
  email: "",
  location: "",
  instagram: "",
  traderStatus: "",
  businessName: "",
  vatNumber: "",
  primaryMedium: "",
  discipline: "",
  subStyles: [],
  portfolioLink: "",
  artistStatement: "",
  offersOriginals: false,
  offersPrints: false,
  offersFramed: false,
  offersCommissions: false,
  openToFreeLoan: false,
  openToRevenueShare: false,
  openToPurchase: false,
  deliveryRadius: "",
  venueTypes: [],
  themes: [],
  hearAbout: "",
  selectedPlan: "core",
  referralCode: "",
  sampleWorkUrls: ["", "", ""],
};

export default function ApplicationForm() {
  const { user, displayName } = useAuth();
  const [form, setForm] = useState<FormState>(initialState);
  const [submitted, setSubmitted] = useState(false);
  // Prefill name + email once the auth context resolves. We can't
  // use them as the initial state because AuthContext is async on
  // first render and the form component might mount before the
  // session is fetched. Update on user change so a sign-in mid-form
  // also lands the values, but only when the artist hasn't already
  // typed something else (preserves any partial draft).
  useEffect(() => {
    if (!user) return;
    setForm((prev) => ({
      ...prev,
      email: prev.email || user.email || "",
      name: prev.name || displayName || "",
    }));
  }, [user, displayName]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  // Field-level validation errors keyed by form field name. Populated from
  // the API's zod issue map, plus a client-side pre-check on submit so the
  // user gets immediate feedback instead of waiting for the round trip.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [agreedToTos, setAgreedToTos] = useState(false);
  const [agreedToArtistTerms, setAgreedToArtistTerms] = useState(false);
  const [acknowledgedInsurance, setAcknowledgedInsurance] = useState(false);
  const [acknowledgedCoolingOff, setAcknowledgedCoolingOff] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value, type } = e.target;
    if (type === "checkbox") {
      const checked = (e.target as HTMLInputElement).checked;
      setForm((prev) => ({ ...prev, [name]: checked }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleMultiCheckbox = (field: "venueTypes" | "themes", value: string) => {
    setForm((prev) => {
      const current = prev[field];
      return {
        ...prev,
        [field]: current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value],
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setFieldErrors({});

    // Client-side pre-check: catch missing fields before hitting the API
    // so the user gets immediate feedback. Mirrors the zod schema so we
    // never disagree with the server about what's required.
    const localErrors: Record<string, string> = {};
    if (!form.name.trim()) localErrors.name = "Tell us your name.";
    if (!form.email.trim()) localErrors.email = "We need an email to reach you.";
    if (!form.location.trim()) localErrors.location = "Where are you based?";
    if (!form.traderStatus) localErrors.traderStatus = "Pick whether you're applying as an individual or a business.";
    if (!form.discipline) localErrors.discipline = "Pick the discipline that best matches your work.";
    // Primary medium is now optional — the discipline + sub-styles
    // selection above already gives us enough to categorise the
    // applicant's work, and forcing artists to pick one specific
    // medium (e.g. "Acrylic") felt restrictive for mixed-media
    // practitioners. They can still set it from their profile.
    if (!form.deliveryRadius) localErrors.deliveryRadius = "How far can you deliver?";
    const offersAny = form.offersOriginals || form.offersPrints || form.offersFramed || form.offersCommissions;
    if (!offersAny) localErrors.offers = "Pick at least one type of work you can supply.";
    const openAny = form.openToFreeLoan || form.openToRevenueShare || form.openToPurchase;
    if (!openAny) localErrors.openTo = "Pick at least one arrangement you're open to.";
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      const first = Object.keys(localErrors)[0];
      setError(`Please complete the highlighted fields before submitting.`);
      // Scroll to the first error so the user can act on it.
      setTimeout(() => {
        const el = document.getElementById(first) || document.querySelector(`[name="${first}"]`);
        (el as HTMLElement | null)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          acknowledgedCoolingOff,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        if (data.fieldErrors && typeof data.fieldErrors === "object") {
          setFieldErrors(data.fieldErrors as Record<string, string>);
        }
        setSubmitting(false);
        return;
      }

      // Record terms acceptances (fire-and-forget)
      const termsPayload = {
        userEmail: form.email,
        userType: "artist",
        termsVersion: "v1.0-2026-04",
      };
      fetch("/api/terms/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...termsPayload, termsType: "platform_tos" }),
      }).catch(() => {});
      fetch("/api/terms/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...termsPayload, termsType: "artist_agreement" }),
      }).catch(() => {});

      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  };

  if (submitted) {
    const claimHref = `/apply/claim?email=${encodeURIComponent(form.email)}&name=${encodeURIComponent(form.name)}&medium=${encodeURIComponent(form.primaryMedium)}`;
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        {/* Confirmation */}
        <div className="bg-surface border border-border rounded-sm p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
              <path d="M4 12.5l5.5 5.5L20 6" />
            </svg>
          </div>
          <h2 className="font-serif text-2xl mb-2">Application received</h2>
          <p className="text-muted leading-relaxed">
            Thanks, {form.name}. We&rsquo;ll review it personally and respond within 5 business days.
          </p>
        </div>

        {/* Profile-start CTA — the whole reason this screen exists now.
            Framed as strengthening the application rather than extra admin. */}
        <div className="bg-accent/5 border-2 border-accent/30 rounded-sm p-6 sm:p-8">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-accent mb-3">
            Get a head start
          </p>
          <h3 className="font-serif text-xl text-foreground mb-2">
            Start building your profile while we review
          </h3>
          <p className="text-sm text-muted leading-relaxed mb-5">
            Applications with a finished profile get reviewed faster and
            have a better chance of acceptance. Claim your Wallplace space
            in under two minutes — add a photo, a sentence about your
            practice, whatever you have to hand. You can finish it any time.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href={claimHref}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-accent text-white text-sm font-semibold rounded-sm hover:bg-accent-hover transition-colors"
            >
              Start my profile
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
            </Link>
            <Link
              href="/"
              className="inline-flex items-center justify-center px-6 py-3 text-sm text-muted hover:text-foreground transition-colors"
            >
              I&rsquo;ll do this later
            </Link>
          </div>
        </div>

        <p className="text-xs text-muted text-center">
          Questions?{" "}
          <a href="mailto:applications@wallplace.co.uk" className="text-accent hover:underline">
            applications@wallplace.co.uk
          </a>
        </p>
      </div>
    );
  }

  const inputClass =
    "w-full bg-background border border-border rounded-sm px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/60 transition-colors duration-200";
  const inputClassFor = (field: string) =>
    `${inputClass} ${fieldErrors[field] ? "border-red-400 focus:border-red-500" : ""}`;
  const fieldError = (field: string) =>
    fieldErrors[field] ? (
      <p className="mt-1.5 text-xs text-red-600">{fieldErrors[field]}</p>
    ) : null;
  const labelClass = "block text-sm font-medium text-foreground mb-2";
  const checkboxLabelClass =
    "flex items-center gap-3 cursor-pointer group select-none";
  const checkboxClass =
    "w-4 h-4 rounded-sm border border-border bg-background checked:bg-accent checked:border-accent focus:outline-none cursor-pointer shrink-0";

  return (
    <form onSubmit={handleSubmit} className="space-y-10">
      {/* Personal Details */}
      <div>
        <h3 className="text-xl mb-6 pb-4 border-b border-border">
          About You
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label htmlFor="name" className={labelClass}>
              Full Name <span className="text-accent">*</span>
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={form.name}
              onChange={handleChange}
              required
              placeholder="Your full name"
              className={inputClassFor("name")}
            />
            {fieldError("name")}
          </div>
          <div>
            <label htmlFor="email" className={labelClass}>
              Email Address <span className="text-accent">*</span>
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              required
              placeholder="your@email.com"
              className={inputClassFor("email")}
            />
            {fieldError("email")}
          </div>
          <div>
            <label htmlFor="location" className={labelClass}>
              Location <span className="text-accent">*</span>
            </label>
            <input
              type="text"
              id="location"
              name="location"
              value={form.location}
              onChange={handleChange}
              required
              placeholder="e.g. Hackney, London"
              className={inputClassFor("location")}
            />
            {fieldError("location")}
          </div>
          <div>
            <label htmlFor="instagram" className={labelClass}>
              Instagram Handle
            </label>
            <input
              type="text"
              id="instagram"
              name="instagram"
              value={form.instagram}
              onChange={handleChange}
              placeholder="@yourhandle"
              className={inputClass}
            />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="portfolioLink" className={labelClass}>
              Website / Portfolio <span className="text-muted font-normal">(optional)</span>
            </label>
            <input
              type="text"
              id="portfolioLink"
              name="portfolioLink"
              value={form.portfolioLink}
              onChange={handleChange}
              placeholder="Link to your website, Instagram, Behance, or similar"
              className={inputClassFor("portfolioLink")}
            />
            <p className="mt-1.5 text-xs text-muted">
              Any public link that shows your work. Share what you have — you can add more later when you build your profile on Wallplace.
            </p>
            {fieldError("portfolioLink")}
          </div>

          {/* Sample work URLs — escape hatch for artists who have no
              website / Insta / portfolio to link. Three optional URL
              slots; we tell them up front they can also do this on
              their profile after applying so they don't feel
              pressured to fill them right now. */}
          <div className="md:col-span-2">
            <label className={labelClass}>
              Sample works <span className="text-muted font-normal">(optional)</span>
            </label>
            <p className="text-xs text-muted mb-3">
              No website or Instagram? Paste up to three public links to
              images of your work (Google Drive, Imgur, Dropbox, etc.).
              You can also skip this and upload sample works straight
              to your profile after we accept your application.
            </p>
            <div className="space-y-2">
              {form.sampleWorkUrls.map((url, i) => (
                <input
                  key={i}
                  type="url"
                  value={url}
                  onChange={(e) => {
                    const next = [...form.sampleWorkUrls];
                    next[i] = e.target.value;
                    setForm((prev) => ({ ...prev, sampleWorkUrls: next }));
                  }}
                  placeholder={`Link to sample ${i + 1} (optional)`}
                  className={inputClass}
                />
              ))}
            </div>
          </div>
          <div className="md:col-span-2">
            <label htmlFor="traderStatus" className={labelClass}>
              Are you applying as an individual or a business?{" "}
              <span className="text-accent">*</span>
            </label>
            <select
              id="traderStatus"
              name="traderStatus"
              value={form.traderStatus}
              onChange={handleChange}
              required
              className={`${inputClassFor("traderStatus")} wp-select`}
            >
              <option value="">Select one</option>
              <option value="consumer">
                Individual / sole artist (not in the course of business)
              </option>
              <option value="business">
                Business, limited company, or partnership / sole trader acting in the course of business
              </option>
            </select>
            {fieldError("traderStatus")}
            <p className="mt-2 text-xs text-muted">
              This determines which UK consumer-protection rules apply to your Wallplace membership subscription. You can change this later if your status changes.
            </p>
          </div>
          {form.traderStatus === "business" && (
            <>
              <div>
                <label htmlFor="businessName" className={labelClass}>
                  Business / Trading Name
                </label>
                <input
                  type="text"
                  id="businessName"
                  name="businessName"
                  value={form.businessName}
                  onChange={handleChange}
                  placeholder="e.g. Jane Doe Studio Ltd"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="vatNumber" className={labelClass}>
                  VAT Number (if registered)
                </label>
                <input
                  type="text"
                  id="vatNumber"
                  name="vatNumber"
                  value={form.vatNumber}
                  onChange={handleChange}
                  placeholder="GB123456789"
                  className={inputClass}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Practice */}
      <div>
        <h3 className="text-xl mb-6 pb-4 border-b border-border">
          Your Practice
        </h3>
        <div className="space-y-5">
          {/* Discipline comes first — it's the primary taxonomy venues
              filter by, and picking it narrows the Primary Medium options
              conceptually. */}
          <div id="discipline">
            <p className={labelClass}>
              Discipline <span className="text-accent">*</span>
            </p>
            <p className="text-xs text-muted mb-3">
              Pick the single top-level discipline your work sits in.
            </p>
            {fieldError("discipline")}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {DISCIPLINES.map((d) => {
                const selected = form.discipline === d.id;
                return (
                  <label
                    key={d.id}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-sm border cursor-pointer transition-colors ${
                      selected
                        ? "border-accent bg-accent/5"
                        : "border-border hover:border-accent/30 bg-background"
                    }`}
                  >
                    <input
                      type="radio"
                      name="discipline"
                      value={d.id}
                      checked={selected}
                      onChange={() => {
                        // Prune sub-styles that don't belong to the new discipline.
                        const allowed = new Set<string>(getDisciplineById(d.id)?.subStyles ?? []);
                        setForm((prev) => ({
                          ...prev,
                          discipline: d.id,
                          subStyles: prev.subStyles.filter((s) => allowed.has(s)),
                        }));
                      }}
                      className="w-4 h-4 text-accent border-border focus:ring-accent/50 cursor-pointer"
                    />
                    <span className="text-sm text-foreground">{d.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <label htmlFor="primaryMedium" className={labelClass}>
              Primary Medium <span className="text-muted font-normal">(optional)</span>
            </label>
            <select
              id="primaryMedium"
              name="primaryMedium"
              value={form.primaryMedium}
              onChange={handleChange}
              className={`${inputClassFor("primaryMedium")} wp-select`}
            >
              <option value="">Select your primary medium (optional)</option>
              {primaryMediums.map((medium) => (
                <option key={medium} value={medium}>
                  {medium}
                </option>
              ))}
            </select>
            {fieldError("primaryMedium")}
          </div>

          {form.discipline && (
            <div>
              <p className={labelClass}>
                Sub-styles <span className="text-muted font-normal">(select any that apply)</span>
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {(getDisciplineById(form.discipline)?.subStyles ?? []).map((sub) => {
                  const active = form.subStyles.includes(sub);
                  return (
                    <button
                      key={sub}
                      type="button"
                      onClick={() => {
                        setForm((prev) => ({
                          ...prev,
                          subStyles: active
                            ? prev.subStyles.filter((s) => s !== sub)
                            : [...prev.subStyles, sub],
                        }));
                      }}
                      className={`px-3 py-1.5 text-xs rounded-sm border transition-colors cursor-pointer ${
                        active
                          ? "bg-foreground text-white border-foreground"
                          : "border-border text-muted hover:border-foreground/30"
                      }`}
                      aria-pressed={active}
                    >
                      {formatSubStyleLabel(sub)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label htmlFor="artistStatement" className={labelClass}>
              Artist Statement
            </label>
            <textarea
              id="artistStatement"
              name="artistStatement"
              value={form.artistStatement}
              onChange={handleChange}
              rows={5}
              placeholder="Optional — a few lines about your practice, what drives your work, and what makes it suited to commercial spaces. You can add this later."
              className={`${inputClass} resize-none`}
            />
            {(() => {
              const words = form.artistStatement.trim().split(/\s+/).filter(Boolean).length;
              if (words === 0) return <p className="mt-1.5 text-xs text-muted">Skip for now and add it when you&rsquo;re ready.</p>;
              return <p className="mt-1.5 text-xs text-muted">{words} {words === 1 ? "word" : "words"}</p>;
            })()}
          </div>
        </div>
      </div>

      {/* Commercial Availability */}
      <div>
        <h3 className="text-xl mb-6 pb-4 border-b border-border">
          What You Offer
        </h3>
        <div className="space-y-6">
          <div>
            <p className={labelClass}>
              I can supply (select all that apply){" "}
              <span className="text-accent">*</span>
            </p>
            {fieldError("offers")}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              {[
                { name: "offersOriginals", label: "Original works" },
                { name: "offersPrints", label: "Prints & reproductions" },
                { name: "offersFramed", label: "Framed works" },
                { name: "offersCommissions", label: "Commissions" },
              ].map(({ name, label }) => (
                <label key={name} className={checkboxLabelClass}>
                  <input
                    type="checkbox"
                    name={name}
                    checked={form[name as keyof FormState] as boolean}
                    onChange={handleChange}
                    className={checkboxClass}
                  />
                  <span className="text-sm text-foreground group-hover:text-accent transition-colors duration-150">
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className={labelClass}>
              I am open to (select all that apply){" "}
              <span className="text-accent">*</span>
            </p>
            {fieldError("openTo")}
            <p className="text-xs text-muted mb-3">
              Three ways your work can reach venues. Revenue share means your
              art is displayed free in a venue and you split QR-code sales
              with them. Paid loan means the venue pays you a monthly fee to
              display the work. Direct purchase means the venue buys the
              piece outright.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { name: "openToRevenueShare", label: "Revenue share (QR-enabled loan)" },
                { name: "openToFreeLoan", label: "Paid loan (monthly fee)" },
                { name: "openToPurchase", label: "Direct purchase" },
              ].map(({ name, label }) => (
                <label key={name} className={checkboxLabelClass}>
                  <input
                    type="checkbox"
                    name={name}
                    checked={form[name as keyof FormState] as boolean}
                    onChange={handleChange}
                    className={checkboxClass}
                  />
                  <span className="text-sm text-foreground group-hover:text-accent transition-colors duration-150">
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="deliveryRadius" className={labelClass}>
              Delivery Radius <span className="text-accent">*</span>
            </label>
            <select
              id="deliveryRadius"
              name="deliveryRadius"
              value={form.deliveryRadius}
              onChange={handleChange}
              required
              className={`${inputClassFor("deliveryRadius")} wp-select`}
            >
              <option value="">How far can you deliver artwork?</option>
              {deliveryRadiusOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            {fieldError("deliveryRadius")}
          </div>
        </div>
      </div>

      {/* Venue Preferences */}
      <div>
        <h3 className="text-xl mb-6 pb-4 border-b border-border">
          Venue Preferences
        </h3>
        <div className="space-y-6">
          <div>
            <p className={labelClass}>
              Venue types suited to your work (select all that apply)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              {venueTypes.map((type) => (
                <label key={type} className={checkboxLabelClass}>
                  <input
                    type="checkbox"
                    checked={form.venueTypes.includes(type)}
                    onChange={() => handleMultiCheckbox("venueTypes", type)}
                    className={checkboxClass}
                  />
                  <span className="text-sm text-foreground group-hover:text-accent transition-colors duration-150">
                    {type}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Themes moved out of the application. They'll be captured when
              the artist builds their profile so the application stays
              lightweight. */}
        </div>
      </div>

      {/* How Did You Hear */}
      <div>
        <label htmlFor="hearAbout" className={labelClass}>
          How did you hear about Wallplace?
        </label>
        <select
          id="hearAbout"
          name="hearAbout"
          value={form.hearAbout}
          onChange={handleChange}
          className={`${inputClass} wp-select`}
        >
          <option value="">Select an option</option>
          {hearAboutOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      {/* Referral code */}
      <div>
        <label htmlFor="referralCode" className={labelClass}>
          Referral code
        </label>
        <input
          id="referralCode"
          name="referralCode"
          type="text"
          maxLength={10}
          value={form.referralCode}
          onChange={(e) => setForm((p) => ({ ...p, referralCode: e.target.value.toUpperCase() }))}
          placeholder="e.g. ABCD23"
          className={`${inputClass} uppercase tracking-wider`}
        />
        <p className="mt-1.5 text-xs text-muted">
          If an existing artist referred you, enter their code so they get a free month when you upgrade.
        </p>
      </div>

      {/* Plan Selection */}
      <div>
        <h3 className="text-xl mb-2 pb-4 border-b border-border">
          Choose Your Plan
        </h3>
        <p className="text-xs text-muted mb-5">
          First month free on all plans. You can change your plan at any time after joining.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {planOptions.map((plan) => (
            <button
              key={plan.id}
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, selectedPlan: plan.id }))}
              className={`text-left rounded-sm p-5 border-2 transition-colors ${
                form.selectedPlan === plan.id
                  ? "border-accent bg-accent/5"
                  : "border-border hover:border-accent/30 bg-background"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">{plan.name}</span>
                {"popular" in plan && plan.popular && (
                  <span className="text-[9px] font-medium text-accent uppercase tracking-wider">Popular</span>
                )}
              </div>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-lg font-serif">{plan.price}</span>
                <span className="text-xs text-muted">/month</span>
              </div>
              <p className="text-[10px] text-accent font-medium mb-2">{plan.fee}</p>
              <p className="text-xs text-muted leading-relaxed">{plan.description}</p>
              <div className={`mt-3 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                form.selectedPlan === plan.id ? "border-accent" : "border-border"
              }`}>
                {form.selectedPlan === plan.id && (
                  <div className="w-2 h-2 rounded-full bg-accent" />
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && <p className="text-red-500 text-sm">{error}</p>}

      {/* Terms */}
      <div className="space-y-3">
        <TermsCheckbox
          termsType="platform_tos"
          checked={agreedToTos}
          onChange={setAgreedToTos}
        />
        <TermsCheckbox
          termsType="artist_agreement"
          checked={agreedToArtistTerms}
          onChange={setAgreedToArtistTerms}
        />
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={acknowledgedInsurance}
            onChange={(e) => setAcknowledgedInsurance(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded-sm border border-border bg-background checked:bg-accent checked:border-accent focus:outline-none cursor-pointer shrink-0"
          />
          <span className="text-sm text-foreground">
            I understand that I am responsible for insuring my own artwork, including during transit and while on display in venues. Wallplace does not provide artwork insurance.
          </span>
        </label>

        {form.traderStatus === "consumer" && (
          <div className="bg-surface border border-border rounded-sm p-5">
            <h4 className="text-sm font-medium text-foreground mb-1">
              Your 14-day right to cancel
            </h4>
            <p className="text-xs text-muted leading-relaxed mb-4">
              Because you are applying as an individual (not in the course of business),
              you have the right to cancel your Wallplace membership within 14 days of
              sign-up under the Consumer Contracts Regulations 2013. Your first month
              is free, so no charge will apply in any event.
            </p>
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={acknowledgedCoolingOff}
                onChange={(e) => setAcknowledgedCoolingOff(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded-sm border border-border bg-background checked:bg-accent checked:border-accent focus:outline-none cursor-pointer shrink-0"
              />
              <span className="text-sm text-foreground">
                I acknowledge that I have been informed of my 14-day right to cancel, as
                set out in the{" "}
                <a
                  href="/terms#cancellation"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  Platform Terms
                </a>
                .
              </span>
            </label>
          </div>
        )}
      </div>

      {/* Submit */}
      <div className="pt-2">
        <button
          type="submit"
          disabled={
            submitting ||
            !agreedToTos ||
            !agreedToArtistTerms ||
            !acknowledgedInsurance ||
            !form.traderStatus ||
            (form.traderStatus === "consumer" && !acknowledgedCoolingOff)
          }
          className="px-8 py-3.5 bg-foreground text-white text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "Submitting..." : "Submit Application"}
        </button>
      </div>
    </form>
  );
}
