import type { Metadata } from "next";
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
      </body>
    </html>
  );
}
