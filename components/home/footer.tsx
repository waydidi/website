import Link from "next/link";
import { WaydidiLogo } from "@/components/waydidi-logo";

export function WaydidiFooter() {
  const paymentBadges = [
    "stripe",
    "VISA",
    "●●",
    "PromptPay",
    "Apple Pay",
    "G Pay",
  ];
  return (
    <footer id="support" className="no-print mt-14 bg-white text-[#1f1726]">
      <div className="mx-auto max-w-[1180px] px-5 lg:px-0">
        <div className="border-t border-slate-200 pt-12">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.35fr_.8fr_.8fr_.8fr]">
            <div>
              <Link
                href="/"
                className="inline-flex text-[#FF8A05]"
                aria-label="Waydidi home"
              >
                <WaydidiLogo className="h-16 w-auto" />
              </Link>
              <p className="mt-5 max-w-sm text-sm leading-6 text-slate-600">
                Private car transfers across Thailand with professional drivers,
                clear pricing, and secure online booking.
              </p>
              <h3 className="mt-8 font-black">Accepted Payments</h3>
              <div className="mt-4 flex max-w-sm flex-wrap gap-2">
                {paymentBadges.map((badge) => (
                  <span
                    key={badge}
                    className={`grid h-10 min-w-14 place-items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-black ${badge === "stripe" ? "text-[#635BFF]" : badge === "VISA" ? "italic text-[#1434CB]" : badge === "●●" ? "tracking-[-.35em] text-[#EB001B]" : "text-slate-800"}`}
                  >
                    {badge}
                  </span>
                ))}
              </div>
            </div>
            <FooterLinks
              title="Ride"
              links={[
                { label: "Airport transfer", href: "/airport-transfer" },
                { label: "A to B", href: "/a-to-b-transfer" },
                { label: "Long journey", href: "/long-journeys" },
                { label: "Check your booking", href: "/booking/manage" },
              ]}
            />
            <FooterLinks
              title="Trips"
              links={[
                { label: "Hourly private driver", href: "/hourly-driver" },
                { label: "Destinations", href: "/destinations" },
                { label: "Airport pickup guide", href: "/airport-pickup-instructions" },
                { label: "Luggage policy", href: "/luggage-policy" },
              ]}
            />
            <FooterLinks
              title="Help"
              links={[
                { label: "Waydidi help", href: "/faq" },
                { label: "Cancellation policy", href: "/cancellation-refund-policy" },
                { label: "Contact us", href: "/contact" },
                { label: "Safety & security", href: "/safety-driver-standards" },
              ]}
            />
          </div>
        </div>

        <div className="mt-16 flex flex-col gap-5 border-t border-slate-200 py-8 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-x-6 gap-y-3 font-semibold">
            <Link href="/faq">Help center</Link>
            <Link href="/booking/manage">Manage booking</Link>
            <Link href="/contact">Contact Waydidi</Link>
          </div>
          <div className="flex flex-wrap gap-5">
            <Link href="/terms">Terms of Use</Link>
            <Link href="/privacy">Privacy Policy</Link>
          </div>
          <p className="text-slate-500">© 2026 Waydidi. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

function FooterLinks({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div>
      <h3 className="font-black">{title}</h3>
      <ul className="mt-5 space-y-3 text-sm text-slate-600">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="hover:text-[#D96F00]">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
