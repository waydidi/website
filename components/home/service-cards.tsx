import Link from "next/link";

export function ServiceCards() {
  const cards = [
    {
      title: "Ride",
      href: "/a-to-b-transfer",
      text: "Go anywhere in Thailand with Waydidi. Reserve your private ride, hop in, and enjoy.",
      image: "/service-ride-orange.png",
      alt: "Orange Waydidi private car",
    },
    {
      title: "Reserve",
      href: "/faq",
      text: "Reserve your ride in advance so you can relax on the day of your trip.",
      image: "/service-reserve.png",
      alt: "Reservation calendar",
    },
    {
      title: "Day trips",
      href: "/hourly-driver",
      text: "Book a private driver and explore several destinations in one comfortable day.",
      image: "/service-daytrip-route-vertical.png",
      alt: "Three location pins connected along a vertical day-trip route",
      imageClass: "service-card-image--large",
    },
  ];
  return (
    <section
      id="services"
      className="mx-auto max-w-[1024px] px-5 pt-10 lg:px-0 lg:pt-14"
    >
      <h2 className="whitespace-nowrap text-[23.67px] font-bold tracking-[-.04em] sm:text-[2rem]">
        Explore what you can do with Waydidi
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
              Details
              <span className="sr-only"> about {card.title}</span>
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
