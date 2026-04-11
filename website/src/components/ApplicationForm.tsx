"use client";

import { useState } from "react";

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
    fee: "10% platform fee",
    description: "Standard profile, basic analytics, marketplace listing.",
  },
  {
    id: "premium",
    name: "Premium",
    price: "£29.99",
    fee: "5% platform fee",
    description: "Featured profile, proactive venue matching, full analytics.",
    popular: true as const,
  },
  {
    id: "pro",
    name: "Pro",
    price: "£100",
    fee: "0% platform fee",
    description: "Premium profile, direct venue matching, dedicated support.",
  },
];

interface FormState {
  name: string;
  email: string;
  location: string;
  instagram: string;
  website: string;
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
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        setSubmitting(false);
        return;
      }

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
            href="mailto:hello@wallspace.co"
            className="text-accent hover:underline"
          >
            hello@wallspace.co
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
              placeholder="Tell us about your practice – what drives your work, what themes you explore, and what makes your work suited to commercial spaces. (100–300 words)"
              className={`${inputClass} resize-none`}
            />
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
              Free loan means artwork displayed at no cost to the venue with
              potential for sales. Revenue share means Wallspace facilitates
              sales from the venue and takes a platform fee. Outright purchase
              means the venue buys the work directly.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { name: "openToFreeLoan", label: "Free loan" },
                { name: "openToRevenueShare", label: "Revenue share" },
                { name: "openToPurchase", label: "Outright purchase" },
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
          How did you hear about Wallspace?
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

      {/* Submit */}
      <div className="pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="px-8 py-3.5 bg-foreground text-white text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "Submitting..." : "Submit Application"}
        </button>
        <p className="mt-4 text-xs text-muted leading-relaxed max-w-md">
          By submitting this form you agree to Wallspace reviewing your
          application and contacting you about your submission. We will not
          share your details with third parties without your consent.
        </p>
      </div>
    </form>
  );
}
