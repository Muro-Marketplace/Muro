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
  // CSP in report-only mode first — flip to enforcing after a week of
  // clean reports. Swap the header key to `Content-Security-Policy`.
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
};

export default nextConfig;
