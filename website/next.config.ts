import type { NextConfig } from "next";

// Content Security Policy — kept as a constant so the header() block stays
// readable. Start in report-only mode: browsers log violations but don't
// enforce. Once the report log is quiet for a week, flip the header name
// to `Content-Security-Policy` (enforcing).
//
// Sources allowed:
//   - self everywhere
//   - images from self + data: + https: (Supabase Storage, Unsplash)
//   - scripts: self + Stripe + Vercel Analytics + inline (Next.js needs it)
//   - connect: self + Supabase (wss + https) + Stripe API + Resend
//   - frames only from Stripe (3DS modal) and self (email-preview iframe)
//   - no plugins, no base override
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  // Next.js emits inline + hydration scripts; Stripe + Vercel analytics are
  // the only 3rd-party scripts we load. 'unsafe-eval' is needed for Next in
  // dev — tighten once we're comfortable with the report log.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://m.stripe.network https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://api.resend.com https://va.vercel-scripts.com",
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
  "frame-ancestors 'none'",
  "worker-src 'self' blob:",
  "upgrade-insecure-requests",
].join("; ");

const SECURITY_HEADERS = [
  // Clickjacking: CSP's frame-ancestors is the modern replacement, but
  // X-Frame-Options keeps older clients honest. Kept in sync.
  { key: "X-Frame-Options", value: "DENY" },
  // MIME sniffing
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Referrer: don't leak full URLs to third parties
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Feature policy — deny everything we don't use. Geolocation is self-only
  // (we use it for the "local" toggle on /browse).
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=(self), usb=(), magnetometer=(), accelerometer=()" },
  // HSTS: 2 years + preload. Only sent on HTTPS; Vercel terminates TLS so this is safe.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // CSP stays in REPORT-ONLY mode. Decision recorded 2026-06-15 (remediation
  // Phase 6): enforcing requires first confirming the policy produces no
  // violations in production, but there is currently no report sink. The policy
  // has no report-to / report-uri directive and there is no collector endpoint,
  // so there is no violation data to justify the flip. Enforcing blind would
  // risk breaking Stripe Checkout (3DS), Supabase realtime/storage, fonts, or
  // any resource the policy inadvertently omits. The policy looks complete for
  // the known integrations (Stripe, Supabase, Resend, Vercel), but "looks
  // complete" is not "verified clean". To enable enforcement later: add a
  // report-to directive plus a lightweight collector route, observe for a
  // representative window, confirm the reports are clean, then swap this header
  // key to `Content-Security-Policy`.
  { key: "Content-Security-Policy-Report-Only", value: CSP },
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "uwkuhygwvasdzwsusiym.supabase.co" },
    ],
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 2592000, // 30 days
    // Dev-only escape hatch: the Next.js image proxy uses Node's
    // native fetch to download upstream images. On macOS + Node 25,
    // that fetch can't find the system CA bundle and every
    // unsplash/picsum URL fails with UNABLE_TO_GET_ISSUER_CERT_LOCALLY,
    // so dev previews show empty image areas. `unoptimized` in dev
    // makes the browser load the source URL directly, which uses the
    // OS's TLS stack and doesn't trip the issue. Production deploys
    // (NODE_ENV=production) keep the optimised pipeline.
    unoptimized: process.env.NODE_ENV !== "production",
  },
  async headers() {
    return [
      {
        // Apply to every path.
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
  async redirects() {
    return [
      // /spaces is the new canonical URL for the "venues looking for art"
      // listing; keep the old path working with a permanent redirect so
      // bookmarks + indexed links still land in the right place.
      { source: "/spaces-looking-for-art", destination: "/spaces", permanent: true },
      // QR Labels lives at /venue-portal/labels in the codebase, but
      // the sidebar label reads "QR Labels" so users (and anyone who
      // bookmarks from the page title) reasonably guess the URL
      // /venue-portal/qr-labels. Redirect it so the guess works.
      { source: "/venue-portal/qr-labels", destination: "/venue-portal/labels", permanent: true },
      // Same affordance for the artist portal: sidebar label is "QR
      // Labels" but the route is /artist-portal/labels. Catch the
      // obvious guess so the URL isn't a dead-end.
      { source: "/artist-portal/qr-labels", destination: "/artist-portal/labels", permanent: true },
      // And "Social Posts" in the sidebar lives at /artist-portal/posts.
      // Catch the /social guess for the same reason.
      { source: "/artist-portal/social", destination: "/artist-portal/posts", permanent: true },
      // Phase 2.1: phantom slug. /browse/finlay-coles is referenced in
      // some early launch posts; the canonical slug is fin-coles.
      { source: "/browse/finlay-coles", destination: "/browse/fin-coles", permanent: true },
    ];
  },
};

export default nextConfig;
