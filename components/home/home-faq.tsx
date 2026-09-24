"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

type Item = { q: string; a: string };

const TABS: { id: string; label: string; items: Item[] }[] = [
  { id: "booking", label: "Booking", items: [
    { q: "How do I book a transfer?", a: "Enter your pickup, destination, date and time in the search form, choose a car, add the lead passenger's details, then pay. You'll get a booking reference straight away." },
    { q: "What pickup time should I choose?", a: "For an airport arrival, choose your flight's landing time and add your flight number. For a hotel or address pickup, choose the time you want to leave, and allow extra time for traffic when heading to the airport." },
    { q: "How far in advance should I book?", a: "Pickups can be booked from 3 hours ahead. Booking earlier gives you the widest choice of cars." },
    { q: "How do I know my booking is confirmed?", a: "Your ride is confirmed when Waydidi issues a booking reference and the confirmation page shows your journey details. A confirmation email follows." },
    { q: "Can I book for someone else?", a: "Yes. Enter the lead passenger's name and a phone number that works on the day, and keep the booking reference handy." },
  ] },
  { id: "conditions", label: "Conditions", items: [
    { q: "What if my luggage does not fit?", a: "Choose a car that matches both your passengers and your bags; each car shows how many it carries. Contact support before travel for oversized items, sports gear or extra bags." },
    { q: "Can I add a child seat?", a: "Yes. Tap the + button next to Continue after choosing your car and add the number of child seats you need." },
    { q: "Are tolls included?", a: "Tap the ? on any car to see exactly what's included for your route. Tolls are included on selected routes and listed under Excluded on the others." },
  ] },
  { id: "changes", label: "Changes", items: [
    { q: "Can I change the date or time?", a: "Eligible bookings can request a date or time change from Manage booking until three days before pickup. Changes depend on availability." },
    { q: "How do I cancel?", a: "Email support@waydidi.com with your booking reference. Requests received at least 24 hours before pickup can be cancelled free of charge." },
  ] },
  { id: "payment", label: "Payment", items: [
    { q: "How can I pay?", a: "Pay online by card, PromptPay, Apple Pay or Google Pay, or choose cash and pay your driver on the day." },
    { q: "Which currency will I be charged in?", a: "Prices can be shown in your chosen currency, but every booking is charged in Thai baht (THB)." },
    { q: "How do I use a promo code?", a: "Enter the code in the Promo code box on the payment step and tap Apply. The discount shows before you pay." },
  ] },
  { id: "meeting", label: "Meeting", items: [
    { q: "Where will I meet my driver at the airport?", a: "Your confirmation shows the pickup instructions. Keep your phone on after landing, as the exact meeting point can vary by terminal." },
    { q: "Do you track my flight?", a: "When you add a valid flight number, we use it to follow arrival changes. Please still tell us about major itinerary changes." },
    { q: "How do I check my ride?", a: "Open Manage booking and enter your booking reference together with the verification details requested." },
  ] },
];

export function HomeFaq() {
  const [tab, setTab] = useState(TABS[0].id);
  const [open, setOpen] = useState<string | null>(null);
  const items = TABS.find((t) => t.id === tab)!.items;

  return <section aria-labelledby="home-faq-heading" className="font-home bg-white py-10 sm:py-14">
    <h2 id="home-faq-heading" className="mx-auto max-w-[760px] px-5 text-left text-[28px] font-bold leading-[1.1] tracking-[-.03em] text-[#1C1C1C]">Frequently Asked Questions</h2>
    <div role="tablist" aria-label="FAQ topics" className="mx-auto mt-6 flex max-w-[760px] gap-2 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {TABS.map((t) => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => { setTab(t.id); setOpen(null); }}
        className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[15px] font-semibold transition ${tab === t.id ? "bg-brand text-white" : "text-[#8A8A8A] hover:text-[#1C1C1C]"}`}>{t.label}</button>)}
    </div>
    <ul role="tabpanel" className="mx-auto mt-4 max-w-[760px] px-5">
      {items.map((item, i) => {
        const id = `${tab}-${i}`;
        const expanded = open === id;
        return <li key={id} className="border-b border-[#E6E6E6] last:border-b-0">
          <button type="button" aria-expanded={expanded} aria-controls={`${id}-a`} onClick={() => setOpen(expanded ? null : id)} className="flex w-full items-center gap-4 py-5 text-left">
            <span className="flex-1 text-[15px] font-semibold leading-6 text-[#1C1C1C]">{item.q}</span>
            <span className={`grid size-6 shrink-0 place-items-center rounded-full border-[1.5px] border-[#BDBDBD] text-[#9A9A9A] transition ${expanded ? "rotate-45" : ""}`}><Plus size={14} strokeWidth={2.2} aria-hidden="true" /></span>
          </button>
          {expanded && <p id={`${id}-a`} className="-mt-2 pb-5 pr-10 text-[14px] leading-6 text-[#4A4A4A]">{item.a}</p>}
        </li>;
      })}
    </ul>
  </section>;
}
