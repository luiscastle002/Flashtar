import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard/",
        "/api/",
        "/settings/",
        "/decks/",
      ],
    },
    sitemap: "https://flashtar.app/sitemap.xml",
  };
}
