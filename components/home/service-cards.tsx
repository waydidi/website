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
      image: "/service-ride-orange.png",
      alt: t("services.ride.alt"),
    },
    {
      title: t("services.reserve.title"),
      href: "/faq",
      text: t("services.reserve.text"),
      image: "/service-reserve.png",
      alt: t("services.reserve.alt"),
    },
    {
      title: t("services.dayTrips.title"),
      href: "/hourly-driver",
      text: t("services.dayTrips.text"),
      image: "/service-daytrip-route-vertical.png",
      alt: t("services.dayTrips.alt"),
      imageClass: "service-card-image--large",
    },
  ];
  return (
    <section
      id="services"
      className="mx-auto max-w-[1024px] px-5 pt-10 lg:px-0 lg:pt-14"
    >
      <h2 className={`${locale === "en" ? "whitespace-nowrap" : "text-balance"} text-[23.67px] font-bold tracking-[-.04em] sm:text-[2rem]`}>
        {t("services.heading")}
      </h2>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <article
            key={card.title}
            className="relative min-h-[190px] overflow-hidden rounded-2xl bg-[#f3f3f3] p-5"
          >
            <div className="relative z-10 w-[70%]">
              <h3 className="text-lg font-bold">{card.title}</h3>
              <p className="mt-2 text-sm leading-5 text-[#17171a]">
                {card.text}
              </p>
            </div>
            <Link
              href={card.href}
              className="absolute bottom-4 left-5 z-10 inline-flex rounded-full bg-white px-4 py-2 text-sm font-bold transition hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8A05]"
            >
              {t("services.details")}
              <span className="sr-only"> {t("services.detailsAbout", { title: card.title })}</span>
            </Link>
            <img
              className={`service-card-image ${card.imageClass ?? ""}`}
              src={card.image}
              alt={card.alt}
            />
          </article>
        ))}
      </div>
    </section>
  );
}
