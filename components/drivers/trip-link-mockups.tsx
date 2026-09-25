// Two phones showing the driver trip link (example data), Daytrip-app style.
function Phone({ className, children }: { className: string; children: React.ReactNode }) {
  return <div className={`w-[62%] max-w-[250px] rounded-t-[30px] border-[6px] border-b-0 border-[#4B4D55] bg-white text-left text-[#111] ${className}`} aria-hidden="true">
    <p className="flex justify-between px-4 pt-2.5 text-[10px] font-semibold"><span>09:41</span><span>●●● ▮</span></p>
    {children}
  </div>;
}

export function TripLinkMockups() {
  return <div className="relative mx-auto h-[300px] max-w-[420px] sm:h-[360px]">
    <Phone className="absolute left-0 top-0">
      <div className="border-b border-[#EEE] px-3 py-2 text-[9px]"><p className="font-semibold">Mon, 16 Nov at 13:45</p><p className="text-[#888]">Pickup in 2 days</p></div>
      <div className="px-3 py-2 text-[9px]">
        <span className="rounded-full bg-[#111] px-2 py-0.5 text-[8px] text-white">Airport pickup</span>
        <p className="mt-2 text-[#888]">Monday</p><p className="text-[15px] font-bold leading-tight">16 November<br />13:45</p>
        <p className="mt-2 inline-block rounded-full border border-[#CCC] px-2 text-[8px]">Sedan</p>
        <p className="mt-2 font-semibold">● Suvarnabhumi Airport (BKK)</p>
        <p className="ml-1 border-l border-dashed border-[#BBB] pl-2 text-[8px] text-[#888]">Flight TG 921 · Meet &amp; Greet</p>
        <p className="font-semibold">● Hilton Pattaya</p>
      </div>
    </Phone>
    <Phone className="absolute right-0 top-14">
      <div className="border-b border-[#EEE] px-3 py-2 text-center text-[10px] font-semibold">Trip status</div>
      <div className="grid gap-1.5 px-3 py-2.5 text-[9px]">
        {[["On the way", true], ["Waiting at pickup", false], ["PIN verified", false], ["On trip", false], ["Arrived", false]].map(([label, done]) => <p key={String(label)} className={`rounded-lg px-2.5 py-2 font-semibold ${done ? "bg-[#FF8A05] text-white" : "bg-[#F2F3F7] text-[#555]"}`}>{done ? "✓ " : ""}{label}</p>)}
      </div>
    </Phone>
  </div>;
}
