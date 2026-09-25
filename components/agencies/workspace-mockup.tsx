// Browser-window mockups of the planned agency workspace (example data only).
const NAV = ["Dashboard", "Bookings", "Passengers", "Profile", "Billing", "Reports"];

const RIDES = [
  { ref: "WD84120", when: "16 Nov 2026 · 13:45", from: "Suvarnabhumi Airport (BKK)", to: "Hilton Pattaya", status: "Awaiting payment", tone: "bg-amber-50 text-amber-700" },
  { ref: "WD77261", when: "23 Nov 2026 · 09:30", from: "Phuket Airport (HKT)", to: "Kata Beach", status: "Confirmed", tone: "bg-emerald-50 text-emerald-700" },
];

function Frame({ active, children }: { active: string; children: React.ReactNode }) {
  return <div className="overflow-hidden rounded-xl border border-[#DDD9D0] bg-white text-left shadow-[0_18px_40px_rgba(0,0,0,.12)]" aria-hidden="true">
    <div className="flex items-center gap-2 border-b border-[#EEE] bg-[#F6F6F6] px-3 py-2">
      <span className="flex gap-1"><i className="size-2 rounded-full bg-[#FF5F57]" /><i className="size-2 rounded-full bg-[#FEBC2E]" /><i className="size-2 rounded-full bg-[#28C840]" /></span>
      <span className="mx-auto rounded bg-white px-8 py-0.5 text-[7px] text-[#999]">waydidi.com/agency</span>
    </div>
    <div className="flex items-center justify-between bg-black px-3 py-1.5 text-[8px] font-bold text-white"><span className="text-[#FF8A05]">Waydidi</span><span className="rounded bg-white px-1.5 py-0.5 text-[6px] text-black">Siam Travel Co.</span></div>
    <div className="flex min-h-[210px] sm:min-h-[300px]">
      <div className="flex w-[22%] shrink-0 flex-col gap-1 border-r border-[#EEE] p-2">
        <p className="mb-1 rounded bg-[#F4F4F4] p-1 text-[6px] font-bold">Siam Travel Co.<span className="block font-normal text-[#999]">Travel agency · partner rate</span></p>
        {NAV.map((n) => <span key={n} className={`rounded px-1.5 py-1 text-[6px] ${n === active ? "bg-black font-bold text-white" : "text-[#777]"}`}>{n}</span>)}
        <span className="mt-auto rounded bg-black py-1 text-center text-[6px] font-bold text-white">Book a transfer</span>
      </div>
      <div className="min-w-0 flex-1 bg-[#FAFAFA] p-2.5">{children}</div>
    </div>
  </div>;
}

export function DashboardMockup() {
  return <Frame active="Dashboard">
    <div className="rounded-lg bg-black p-3 text-white"><p className="text-[6px] text-white/60">Good morning</p><p className="text-[10px] font-bold">Siam Travel Co.</p><p className="mt-1 flex gap-1 text-[5px]"><span className="rounded bg-white/15 px-1">Travel agency</span><span className="rounded bg-emerald-500/25 px-1 text-emerald-200">Partner rate</span></p></div>
    <div className="mt-2 grid grid-cols-3 gap-1.5">{[["Upcoming rides", "2"], ["Completed rides", "15"], ["Passengers", "38"]].map(([l, v]) => <div key={l} className="rounded border border-[#EEE] bg-white p-1.5"><p className="text-[5px] text-[#999]">{l}</p><p className="text-[10px] font-bold">{v}</p></div>)}</div>
    <p className="mt-2 text-[6px] font-bold">Quick actions</p>
    <div className="mt-1 grid grid-cols-4 gap-1">{["Book a transfer", "Statements", "Passengers", "Settings"].map((a) => <span key={a} className="rounded border border-[#EEE] bg-white p-1 text-[5px] font-bold">{a}</span>)}</div>
    <div className="mt-2 rounded border border-[#EEE] bg-white p-1.5"><p className="text-[6px] font-bold">Your next rides</p>{RIDES.map((r) => <p key={r.ref} className="mt-1 flex justify-between gap-1 text-[5px] text-[#555]"><span>{r.when}</span><span className="truncate">{r.from} → {r.to}</span><span className={`rounded px-1 ${r.tone}`}>{r.status}</span></p>)}</div>
  </Frame>;
}

export function BookingsMockup() {
  return <Frame active="Bookings">
    <p className="flex gap-3 text-[6px]"><span className="border-b border-black font-bold">Upcoming</span><span className="text-[#999]">Completed</span><span className="text-[#999]">Cancelled</span></p>
    <div className="mt-2 grid grid-cols-2 gap-1.5"><span className="rounded border border-[#EEE] bg-white p-1 text-[5px] text-[#999]">Search by pickup, destination, passenger…</span><span className="rounded border border-[#EEE] bg-white p-1 text-[5px] text-[#999]">Search by date range</span></div>
    <p className="mt-2 text-[8px] font-bold">Bookings <span className="rounded bg-black px-1 text-white">2</span></p>
    {RIDES.map((r) => <div key={r.ref} className="mt-1.5 rounded border border-[#EEE] bg-white p-1.5">
      <p className="flex justify-between text-[5px]"><span className="text-[#999]">BOOKING <b className="text-black">{r.ref}</b></span><span className={`rounded px-1 ${r.tone}`}>{r.status}</span></p>
      <p className="mt-1 grid grid-cols-3 gap-1 text-[5px]"><span>{r.when}</span><span className="font-bold">{r.from}</span><span className="font-bold">{r.to}</span></p>
    </div>)}
  </Frame>;
}

export function DetailMockup() {
  const r = RIDES[0];
  return <Frame active="Bookings">
    <p className="text-[8px] font-bold">← Booking {r.ref} <span className={`rounded px-1 text-[5px] ${r.tone}`}>{r.status}</span></p>
    <div className="mt-2 grid grid-cols-[1.6fr_1fr] gap-1.5">
      <div className="grid gap-1.5">
        <div className="rounded border border-[#EEE] bg-white p-1.5 text-[5px]"><p className="font-bold">{r.when}</p><p className="mt-1">■ {r.from}</p><p className="ml-1 border-l border-[#CCC] pl-1 text-[#999]">1 h 30 min · 122 km · 2 passengers</p><p>■ {r.to}</p></div>
        <div className="rounded border border-[#EEE] bg-white p-1.5 text-[5px]"><p className="text-[#999]">YOUR VEHICLE</p><p className="font-bold">Economy sedan · up to 3 passengers</p></div>
        <div className="rounded border border-[#EEE] bg-white p-1.5 text-[5px]"><p className="font-bold">Passenger</p><p className="text-[#555]">Ms. Example Traveller · +66 81 000 0000</p></div>
      </div>
      <div className="grid content-start gap-1.5">
        <div className="rounded border border-[#EEE] bg-white p-1.5 text-[5px]"><p className="flex justify-between"><span>Total</span><b>THB 1,400</b></p><span className="mt-1 block rounded bg-[#00B14F] py-1 text-center font-bold text-white">Pay booking</span></div>
        <span className="rounded bg-black py-1 text-center text-[5px] font-bold text-white">Book again</span>
        <span className="rounded border border-[#EEE] bg-white py-1 text-center text-[5px] font-bold">Download voucher</span>
      </div>
    </div>
  </Frame>;
}
