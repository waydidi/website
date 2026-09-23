import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { getMessages, translate, type Locale } from "@/lib/i18n";

export function ServiceCards({ locale = "en" }: { locale?: Locale }) {
  const messages = getMessages(locale);
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string>) => translate(messages, key, vars);
  const cards = [
    {
      title: t("services.ride.title"),
      href: "/a-to-b-transfer",
      text: t("services.ride.text"),
      image: { src: "/service-ride-orange.png", width: 520, height: 340 },
      alt: t("services.ride.alt"),
    },
    {
      title: t("services.reserve.title"),
      href: "/faq",
      text: t("services.reserve.text"),
      image: { src: "/service-reserve.png", width: 220, height: 180 },
      alt: t("services.reserve.alt"),
    },
    {
      title: t("services.dayTrips.title"),
      href: "/hourly-driver",
      text: t("services.dayTrips.text"),
      image: { src: "/service-daytrip-route-vertical.png", width: 360, height: 540 },
      alt: t("services.dayTrips.alt"),
    },
  ];
  return (
    <section
      id="services"
      className="mx-auto max-w-[1024px] px-5 pt-10 lg:px-0 lg:pt-14"
    >
      {/* Wraps in every language: forcing one line pushed the English
          heading 25px past a 390px phone screen. */}
      <h2 className="text-balance text-[23.67px] font-bold tracking-[-.03em] sm:text-[2rem]">
        {t("services.heading")}
      </h2>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <article
            key={card.title}
            className="group flex min-h-[190px] flex-col rounded-2xl bg-surface p-5 transition duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-orange-950/5 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          >
            <div className="grid flex-1 grid-cols-[1fr_96px] items-start gap-4">
              <div>
                <h3 className="text-lg font-bold">{card.title}</h3>
                <p className="mt-2 text-sm leading-5 text-ink/80">{card.text}</p>
              </div>
              {/* Real dimensions reserve the space, so the card does not jump as it loads. */}
              <Image
                src={card.image.src}
                width={card.image.width}
                height={card.image.height}
                alt={card.alt}
                unoptimized
                className="h-[92px] w-full object-contain transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
              />
            </div>
            <Link
              href={card.href}
              className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-bold shadow-sm transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {t("services.details")}
              <span className="sr-only"> {t("services.detailsAbout", { title: card.title })}</span>
              <ArrowRight size={15} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
