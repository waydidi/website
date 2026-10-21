import { getMessages, translate, type Locale } from "@/lib/i18n";

// A calm brand line under the hero: a big headline and one line of promise on a soft Waydidi-orange background.
export function HomeTagline({ locale = "en" }: { locale?: Locale }) {
  const messages = getMessages(locale);
  return <section aria-labelledby="home-tagline" className="bg-[#FFE6CC] px-5 py-24 text-center text-charcoal sm:py-32 lg:py-40">
    <h2 id="home-tagline" className="mx-auto max-w-[900px] font-[Georgia,'Times_New_Roman',serif] text-[44px] font-medium leading-[1.05] tracking-[-.03em] sm:text-[64px] lg:text-[84px]">{translate(messages, "home.tagline.title")}</h2>
    <p className="mx-auto mt-6 max-w-[640px] text-[18px] font-semibold leading-snug sm:mt-8 sm:text-[22px]">{translate(messages, "home.tagline.text")}</p>
  </section>;
}
