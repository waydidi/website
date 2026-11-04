import { getMessages, translate, type Locale } from "@/lib/i18n";

// One headline and three short promises, under the photo slides. The page's <h1> is in the hero.
export function HomeIntro({ locale = "en" }: { locale?: Locale }) {
  const messages = getMessages(locale);
  const points = (["private", "price", "local"] as const).map((key) => translate(messages, `home.intro.${key}`));
  return <section aria-labelledby="home-intro" className="mx-auto w-full max-w-[1180px] px-5 py-12 text-center text-plum sm:py-16">
    <h2 id="home-intro" className="text-[26px] font-black leading-tight tracking-[-.035em] sm:text-[34px]">{translate(messages, "home.intro.title")}</h2>
    <ul className="mt-8 grid divide-y divide-slate-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {points.map((point) => <li key={point} className="px-6 py-4 text-lg font-medium leading-snug sm:text-xl">{point}</li>)}
    </ul>
  </section>;
}
