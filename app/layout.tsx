import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://waydidi-private-transfer.dankbangkok.chatgpt.site"),
  title: "Waydidi — Private Transfers in Thailand",
  description:
    "Book a comfortable private transfer across Thailand with professional drivers and clear, upfront pricing.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  alternates: { canonical: "/" },
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
      <body className="antialiased">{children}</body>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
    </html>
  );
}
