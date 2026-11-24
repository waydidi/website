import { SHARE_IMAGE } from "@/components/seo";
import type { Metadata } from "next";
import { getMessages, localeInfo, type Locale } from "@/lib/i18n";
import { SITE_URL } from "@/lib/public-content";
import { HomeContent } from "./home-content";
import { DevNotice } from "./dev-notice";
import { WHATSAPP, WHATSAPP_URL } from "@/lib/contact";

export function homeMetadata(locale: Locale): Metadata {
  const messages = getMessages(locale);
  const url = (code: Locale) => `${SITE_URL}${localeInfo[code].path === "/" ? "" : localeInfo[code].path}`;
  return {
    title: messages["meta.title"],
    description: messages["meta.description"],
    alternates: {
      canonical: url(locale),
    },
    openGraph: {
      title: messages["meta.title"],
      description: messages["meta.description"],
      url: url(locale),
      type: "website",
      locale: locale === "th" ? "th_TH" : locale === "zh" ? "zh_CN" : "en_TH",
      images: [SHARE_IMAGE],
    },
  };
}

export function HomePage({ locale }: { locale: Locale }) {
  const messages = getMessages(locale);
  return (
    <HomeContent locale={locale}>
      {/* Online booking is not ready yet: tell homepage visitors to book on WhatsApp. */}
      <DevNotice title={messages["devNotice.title"]} body={messages["devNotice.body"]} whatsapp={WHATSAPP} whatsappUrl={WHATSAPP_URL}
        contactLabel={messages["devNotice.contact"]} closeLabel={messages["devNotice.close"]} />
    </HomeContent>
  );
}
