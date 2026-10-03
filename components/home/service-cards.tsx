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
      image: { src: "/service-ride-airport.webp", width: 480, height: 406 },
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
      <h2 className="text-[28px] font-bold leading-[1.1] tracking-[-.03em]">
        {t("services.heading")}
      </h2>
      {/* One full card plus 15% of the next: viewport = 20px inset + 12px gap + 1.15 cards. */}
      <div className="-mx-5 mt-6 flex gap-3 overflow-x-auto overscroll-x-contain snap-x snap-mandatory scroll-px-5 px-5 pb-2 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:px-0 md:pb-0 [&::-webkit-scrollbar]:hidden">
        {cards.map((card) => { const ride = card.image.src === "/service-ride-airport.webp"; return (
          <article
            key={card.title}
            className="group relative flex min-h-[153px] w-[calc((100vw-32px)/1.15)] shrink-0 snap-start flex-col md:min-h-[170px] md:w-auto md:min-w-0 md:shrink rounded-[14.4px] md:rounded-2xl bg-surface px-[18px] py-[14.4px] md:px-5 md:py-4 transition duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-orange-950/5 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          >
            <div className="grid flex-1 grid-cols-[minmax(0,1fr)_95.4px] items-start gap-[7.2px] md:grid-cols-[minmax(0,1fr)_106px] md:gap-2">
              <div>
                <h3 className="text-[16.2px] leading-[25.2px] font-bold md:text-lg md:leading-7">{card.title}</h3>
                <p className="mt-[7.2px] text-[12.6px] leading-[18px] text-ink/80 md:mt-2 md:text-sm md:leading-5">{card.text}</p>
              </div>
              {/* Keeps the text clear of the picture, which is centred in the card. */}
              <span aria-hidden="true" />
            </div>
            {/* Real dimensions reserve the space, so the card does not jump as it loads. */}
            <div className={`pointer-events-none absolute right-[18px] top-1/2 md:right-5 -translate-y-1/2 ${ride ? "w-[99.9px] md:w-[111px]" : "w-[95.4px] md:w-[106px]"}`}>
              <Image
                src={card.image.src}
                width={card.image.width}
                height={card.image.height}
                alt={card.alt}
                unoptimized
                className={`${ride ? "h-[95.4px] md:h-[106px]" : "h-[90.9px] md:h-[101px]"} w-full object-contain transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100`}
              />
            </div>
            <Link
              href={card.href}
              className="mt-1 inline-flex w-fit items-center gap-[5.4px] rounded-full bg-white px-[14.4px] py-[7.2px] text-[12.6px] leading-[18px] md:leading-5 md:gap-1.5 md:px-4 md:py-2 md:text-sm font-bold shadow-sm transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {t("services.details")}
              <span className="sr-only"> {t("services.detailsAbout", { title: card.title })}</span>
              <ArrowRight size={15} aria-hidden="true" className="size-[13.5px] transition-transform group-hover:translate-x-0.5 md:size-[15px]" />
            </Link>
          </article>
        ); })}
      </div>
    </section>
  );
}
