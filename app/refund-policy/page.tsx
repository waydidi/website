import type { Metadata } from "next";
import { PublicFooter } from "@/components/public-footer";
import { Breadcrumbs, JsonLd, breadcrumbSchema } from "@/components/seo";
import { SITE_URL } from "@/lib/public-content";
import { REFUND_POLICY_VERSION, FULL_REFUND_HOURS, PARTIAL_REFUND_HOURS, PARTIAL_REFUND_PERCENT, GENERAL_REFUND_TIERS } from "@/lib/refund-policy";

const URL_PATH = "/refund-policy";
export const metadata: Metadata = {
  title: "Refund & Cancellation Policy | Waydidi Travel",
  description: "Read Waydidi Travel's cancellation and refund policy, including refund eligibility, booking changes, payment processing and cancellation conditions.",
  alternates: { canonical: `${SITE_URL}${URL_PATH}` },
};

const cards = [
  { when: GENERAL_REFUND_TIERS[0].label, result: "100% refund", text: `Cancel more than ${FULL_REFUND_HOURS} hours before your scheduled service to receive a full refund, unless different conditions were stated for your booking.`, tone: "border-emerald-200 bg-emerald-50", accent: "text-emerald-700" },
  { when: GENERAL_REFUND_TIERS[1].label, result: `${PARTIAL_REFUND_PERCENT}% refund`, text: `Cancel between ${PARTIAL_REFUND_HOURS} and ${FULL_REFUND_HOURS} hours before your scheduled service to receive a ${PARTIAL_REFUND_PERCENT}% refund, unless different booking conditions apply.`, tone: "border-amber-200 bg-amber-50", accent: "text-amber-700" },
  { when: GENERAL_REFUND_TIERS[2].label, result: "Non-refundable", text: `Bookings cancelled less than ${PARTIAL_REFUND_HOURS} hours before the scheduled service are non-refundable.`, tone: "border-slate-200 bg-canvas", accent: "text-slate-700" },
];

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return <section id={id} aria-labelledby={`${id}-h`} className="grid gap-4 border-t border-slate-200 py-9">
    <div className="min-w-0"><h2 id={`${id}-h`} className="text-2xl font-black tracking-[-.03em]">{title}</h2><div className="mt-3 space-y-3 text-[16px] leading-7 text-slate-700">{children}</div></div>
  </section>;
}

export default function RefundPolicyPage() {
  const crumbs = [{ name: "Home", path: "/" }, { name: "Refund & Cancellation Policy", path: URL_PATH }];
  return <main className="bg-white text-plum">
    <JsonLd data={breadcrumbSchema(crumbs)} />
    {/* Compact hero, no photo */}
    <section className="bg-brand-wash"><div className="mx-auto max-w-[1080px] px-5 pb-10 pt-8 sm:pt-12 lg:px-8">
      <Breadcrumbs crumbs={crumbs} className="text-slate-600" />
      <h1 className="mt-4 text-[34px] font-black leading-[1.05] tracking-[-.04em] sm:text-5xl">Refund &amp; Cancellation Policy</h1>
      <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-700">Travel plans can change. Our cancellation policy is designed to clearly explain when your booking can be changed, cancelled, or refunded.</p>
      <p className="mt-3 text-sm text-slate-500">Policy version {REFUND_POLICY_VERSION} · Times are Thailand time (Asia/Bangkok)</p>
    </div></section>

    <div className="mx-auto max-w-[1080px] px-5 lg:px-8">
      {/* Cancellation at a glance */}
      <section aria-labelledby="glance-h" className="py-12">
        <h2 id="glance-h" className="text-3xl font-black tracking-[-.035em]">Cancellation at a glance</h2>
        <ul className="mt-6 grid gap-4 md:grid-cols-3">
          {cards.map(({ when, result, text, tone, accent }) => <li key={when} className={`rounded-[24px] border p-6 ${tone}`}>
            <p className="text-[15px] font-bold text-slate-800">{when}</p>
            <p className={`mt-3 text-[30px] font-black tracking-[-.03em] ${accent}`}>{result}</p>
            <p className="mt-2 text-[15px] leading-6 text-slate-700">{text}</p>
          </li>)}
        </ul>
        <p className="mt-5 rounded-2xl border-l-4 border-brand bg-brand-wash p-4 text-[15px] leading-6 text-slate-700">Some tours, attraction tickets, boat trips, activities, and third-party services may have different cancellation conditions. Where specific conditions are shown before booking, those conditions take precedence over this general policy.</p>
      </section>

      <Section id="customer-cancellation" title="Customer cancellation">
        <p>Unless otherwise stated on the specific service or booking:</p>
        <div tabIndex={0} role="region" aria-label="Refund amounts" className="overflow-x-auto rounded-2xl border border-slate-200"><table className="w-full min-w-[420px] text-left text-[15px]">
          <caption className="sr-only">Refund by cancellation time</caption>
          <thead className="bg-canvas text-slate-600"><tr><th scope="col" className="px-4 py-3 font-semibold">Cancellation time</th><th scope="col" className="px-4 py-3 font-semibold">Refund</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {[[`More than ${FULL_REFUND_HOURS} hours before scheduled service`, "100% refund"], [`${PARTIAL_REFUND_HOURS}–${FULL_REFUND_HOURS} hours before scheduled service`, `${PARTIAL_REFUND_PERCENT}% refund`], [`Less than ${PARTIAL_REFUND_HOURS} hours before scheduled service`, "No refund"], ["No-show", "No refund"]].map(([a, b]) => <tr key={a}><th scope="row" className="px-4 py-3 font-medium">{a}</th><td className="px-4 py-3 font-bold">{b}</td></tr>)}
          </tbody>
        </table></div>
        <p>The notice period is the time between your scheduled service and when we receive your cancellation request, in Thailand time. It is not based on the date you paid.</p>
      </Section>

      <Section id="no-shows" title="No-shows">
        <p>No refund is provided when you do not appear at the agreed pickup location at the scheduled time.</p>
        <p>If you are running late, contact Waydidi as soon as possible. Waiting times depend on the service (for example, airport pickups wait from your flight&apos;s actual landing time), and you are not treated as a no-show the moment the pickup time passes.</p>
      </Section>

      <Section id="waydidi-cancels" title="If Waydidi cancels your service">
        <p>If Waydidi Travel cannot provide a confirmed service and no suitable alternative can be arranged, you receive a <strong>100% refund</strong> for the affected service.</p>
        <p>We may first offer rescheduling, a replacement vehicle, or an alternative service. You are not required to accept a materially different replacement.</p>
      </Section>

      <Section id="changes" title="Changing your booking">
        <p>You can ask to change the pickup date, time or location, destination, vehicle category, passenger count, luggage and other itinerary details.</p>
        <p>All changes are subject to availability and may change the price. Any price difference is confirmed with you before the change is made, and your original booking stays in place until then.</p>
      </Section>

      <Section id="refund-payment" title="How refunds are paid">
        <p>Approved refunds are normally returned to your original payment method. Depending on the cancellation conditions, a refund may be full or partial.</p>
        <p className="rounded-2xl bg-canvas p-4">Once Waydidi submits an approved refund, the time it takes to appear in your account depends on the payment provider, card network, payment method, and your bank. We can&apos;t guarantee an exact posting date.</p>
        <p>Cash bookings have no prepaid amount to refund.</p>
      </Section>

      <Section id="payment-processing" title="Payment processing">
        <p>Waydidi uses trusted payment providers, such as Stripe, to take and refund payments securely. Waydidi never stores your full card number or CVV.</p>
        <p>Refund fees charged by payment providers are covered by Waydidi. They are <strong>not</strong> deducted from your refund.</p>
      </Section>

      <Section id="third-party" title="Tours, tickets & third-party services">
        <p>Third-party products such as tours, attraction tickets, boat trips and activities may have their own cancellation conditions. Conditions shown or sent to you before booking take precedence over this general policy, and we keep a record of the conditions you accepted.</p>
      </Section>

      <Section id="weather" title="Weather & uncontrollable events">
        <p>Bad weather alone does not make a booking refundable if the service can still run safely.</p>
        <p>If an operator cancels because conditions are unsafe, Waydidi may offer rescheduling, an alternative service, credit where specifically agreed, or a refund under the applicable conditions.</p>
        <p>Other events outside reasonable control include severe weather, flooding, natural disasters, road closures, government restrictions, civil emergencies and major transport disruption. Refunds, rescheduling or alternatives depend on the circumstances and the service conditions.</p>
      </Section>
    </div>
    <PublicFooter />
  </main>;
}
