import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PublicPathHeader } from "@/components/public-header";

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
      <head><link rel="icon" href="/favicon.svg" type="image/svg+xml" /></head>
      <body className="antialiased">
        <a
          href="#booking-search"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-white focus:px-5 focus:py-3 focus:font-bold focus:text-[#D96F00] focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#FF8A05]"
        >
          Skip to booking
        </a>
        <PublicPathHeader />
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
          }}
        />
        {/* Mobile Safari tints its floating bottom toolbar from what touches the
            screen's bottom edge; this soft off-white strip gives it a light,
            cloud-like look on every page. Booking bars sit above it (z-50). */}
        <div aria-hidden="true" className="no-print pointer-events-none fixed inset-x-0 bottom-0 z-40 h-[calc(env(safe-area-inset-bottom)+14px)] bg-gradient-to-b from-[#F7F7F5]/0 via-[#F7F7F5]/90 to-[#F7F7F5] lg:hidden" />
      </body>
    </html>
  );
}
