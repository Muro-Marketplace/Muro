"use client";

import { useState } from "react";
import TermsCheckbox from "@/components/TermsCheckbox";

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
  website: string;
  traderStatus: TraderStatus;
  businessName: string;
  vatNumber: string;
  primaryMedium: string;
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
}

const initialState: FormState = {
  name: "",
  email: "",
  location: "",
  instagram: "",
  website: "",
  traderStatus: "",
  businessName: "",
  vatNumber: "",
  primaryMedium: "",
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
};

export default function ApplicationForm() {
  const [form, setForm] = useState<FormState>(initialState);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
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
    setSubmitting(true);
    setError("");

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
    return (
      <div className="bg-surface border border-border rounded-sm p-10 text-center max-w-2xl mx-auto">
        <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-5">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-accent"
          >
            <path d="M4 12.5l5.5 5.5L20 6" />
          </svg>
        </div>
        <h2 className="text-2xl mb-3">Application Received</h2>
        <p className="text-muted leading-relaxed mb-2">
          Thank you, {form.name}. We have received your application and will
          review it personally.
        </p>
        <p className="text-muted leading-relaxed">
          We aim to respond within 5 business days. When accepted, you will receive
          an email with a link to set up your account and profile. In the meantime, if you have any
          questions, email us at{" "}
          <a
            href="mailto:hello@wallplace.co.uk"
            className="text-accent hover:underline"
          >
            hello@wallplace.co.uk
          </a>
          .
        </p>
      </div>
    );
  }

  const inputClass =
    "w-full bg-background border border-border rounded-sm px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/60 transition-colors duration-200";
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
              className={inputClass}
            />
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
              className={inputClass}
            />
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
              className={inputClass}
            />
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
            <label htmlFor="website" className={labelClass}>
              Website
            </label>
            <input
              type="text"
              id="website"
              name="website"
              value={form.website}
              onChange={handleChange}
              placeholder="https://yourwebsite.com"
              className={inputClass}
            />
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
              className={inputClass}
            >
              <option value="">Select one</option>
              <option value="consumer">
                Individual / sole artist (not in the course of business)
              </option>
              <option value="business">
                Business, limited company, or partnership / sole trader acting in the course of business
              </option>
            </select>
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
          <div>
            <label htmlFor="primaryMedium" className={labelClass}>
              Primary Medium <span className="text-accent">*</span>
            </label>
            <select
              id="primaryMedium"
              name="primaryMedium"
              value={form.primaryMedium}
              onChange={handleChange}
              required
              className={inputClass}
            >
              <option value="">Select your primary medium</option>
              {primaryMediums.map((medium) => (
                <option key={medium} value={medium}>
                  {medium}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="portfolioLink" className={labelClass}>
              Portfolio Link <span className="text-accent">*</span>
            </label>
            <input
              type="text"
              id="portfolioLink"
              name="portfolioLink"
              value={form.portfolioLink}
              onChange={handleChange}
              required
              placeholder="Link to your portfolio, website, or online gallery"
              className={inputClass}
            />
            <p className="mt-2 text-xs text-muted">
              Share a link to your best work – website, Behance, Flickr, or
              similar. Make sure the link is publicly accessible.
            </p>
          </div>

          <div>
            <label htmlFor="artistStatement" className={labelClass}>
              Artist Statement <span className="text-accent">*</span>
            </label>
            <textarea
              id="artistStatement"
              name="artistStatement"
              value={form.artistStatement}
              onChange={handleChange}
              required
              rows={5}
              placeholder="Tell us about your practice – what drives your work, what themes you explore, and what makes your work suited to commercial spaces."
              className={`${inputClass} resize-none`}
            />
            {(() => {
              const words = form.artistStatement.trim().split(/\s+/).filter(Boolean).length;
              const outOfRange = words < 100 || words > 300;
              const empty = words === 0;
              return (
                <p className={`mt-1.5 text-xs ${empty ? "text-muted" : outOfRange ? "text-amber-600" : "text-green-600"}`}>
                  {words} {words === 1 ? "word" : "words"} &middot; aim for 100&ndash;300
                </p>
              );
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
            <p className="text-xs text-muted mb-3">
              Display means your art is shown in venues for free — if a customer
              buys via QR, you can offer the venue a revenue share (you set the %).
              Purchase means venues can buy your work outright.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { name: "openToFreeLoan", label: "Display (with optional revenue share)" },
                { name: "openToPurchase", label: "Purchase" },
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
              className={inputClass}
            >
              <option value="">How far can you deliver artwork?</option>
              {deliveryRadiusOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
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

          <div>
            <p className={labelClass}>
              Themes that best describe your work (select all that apply)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              {themeOptions.map((theme) => (
                <label key={theme} className={checkboxLabelClass}>
                  <input
                    type="checkbox"
                    checked={form.themes.includes(theme)}
                    onChange={() => handleMultiCheckbox("themes", theme)}
                    className={checkboxClass}
                  />
                  <span className="text-sm text-foreground group-hover:text-accent transition-colors duration-150">
                    {theme}
                  </span>
                </label>
              ))}
            </div>
          </div>
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
          className={inputClass}
        >
          <option value="">Select an option</option>
          {hearAboutOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
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
