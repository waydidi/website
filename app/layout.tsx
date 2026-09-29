import type { Metadata, Viewport } from "next";
import { env } from "cloudflare:workers";
import "./globals.css";
import { GoogleAnalytics } from "@/components/google-analytics";
import { PublicPathHeader } from "@/components/public-header";
import { SpinBar } from "@/components/spin/spin-bar";

export const metadata: Metadata = {
  metadataBase: new URL("https://waydidi-private-transfer.dankbangkok.chatgpt.site"),
  title: "Waydidi — Private Transfers in Thailand",
  description:
    "Book a comfortable private transfer across Thailand with professional drivers and clear, upfront pricing.",
  openGraph: {
    title: "Waydidi — Private Transfers in Thailand",
    description: "Book a comfortable private transfer across Thailand with trusted local drivers.",
    type: "website",
    locale: "en_TH",
  },
};

// "cover" lets the page reach under Safari's floating toolbar, so the light
// strip below can sit behind it.
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Google Analytics 4 measurement ID, e.g. G-ABC123XYZ (a public ID, set in Cloudflare).
  const gaRaw = String((env as Record<string, unknown>).GA_MEASUREMENT_ID ?? "").trim().toUpperCase();
  const gaId = /^G-[A-Z0-9]{4,20}$/.test(gaRaw) ? gaRaw : "";
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Waydidi Private Transfers",
    provider: { "@type": "Organization", name: "Waydidi", url: "https://waydidi-private-transfer.dankbangkok.chatgpt.site" },
    areaServed: { "@type": "Country", name: "Thailand" },
    serviceType: "Private passenger transfer",
    url: "https://waydidi-private-transfer.dankbangkok.chatgpt.site",
  };
  return (
    <html lang="en">
      {/* A relative link: metadata icons are made absolute with metadataBase,
          which breaks the favicon on any other domain (e.g. workers.dev). */}
      <head><link rel="icon" href="/favicon.png" type="image/png" sizes="256x256" /><link rel="apple-touch-icon" href="/apple-touch-icon.png" /></head>
      <body className="antialiased">
        <a
          href="#booking-search"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-white focus:px-5 focus:py-3 focus:font-bold focus:text-[#D96F00] focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#FF8A05]"
        >
          Skip to booking
        </a>
        <PublicPathHeader />
        {children}
        <SpinBar />
        {gaId && <GoogleAnalytics id={gaId} />}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
          }}
        />
      </body>
    </html>
  );
}
