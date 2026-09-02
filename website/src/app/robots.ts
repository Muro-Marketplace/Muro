import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin/",
          "/artist-portal/",
          "/venue-portal/",
          "/customer-portal/",
          "/checkout/",
          "/reset-password/",
          "/forgot-password/",
          "/placements/",
          "/email-preview/",
          "/dev/",
          "/auth/",
          "/check-your-inbox/",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
