"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MemberBox } from "@/lib/boxes";
import { TIERS } from "@/lib/member-tier-rules";

const tierName = (id: string) => TIERS.find((t) => t.id === id)?.name ?? "Badge";
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");

// Mystery boxes: one per badge reached. Tap to open; the prize is picked on the server.
export function MysteryBoxes({ boxes }: { boxes: MemberBox[] }) {
  const router = useRouter();
  const [opening, setOpening] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, { name: string; emoji: string; description: string; kind: string }>>({});
  const [error, setError] = useState("");
  if (!boxes.length) return null;

  async function open(id: string) {
    if (opening) return;
    setOpening(id); setError("");
    try {
      const res = await fetch("/api/account/boxes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const data = (await res.json()) as { prize?: { name: string; emoji: string; description: string; kind: string }; error?: string };
      if (!res.ok) throw new Error(data.error || "Couldn't open the box. Please try again.");
      await new Promise((r) => setTimeout(r, 1400)); // let the box shake before the reveal
      if (data.prize) setRevealed((v) => ({ ...v, [id]: data.prize! }));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open the box.");
    } finally {
      setOpening(null);
    }
  }

  return <section className="mb-4" aria-labelledby="boxes-heading">
    <h2 id="boxes-heading" className="mb-3 text-lg font-black">Mystery boxes</h2>
    {error && <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
    <ul className="grid gap-3">
      {boxes.map((b) => {
        const shown = revealed[b.id];
        if (!b.openedAt && !shown) return <li key={b.id}>
          <button type="button" onClick={() => open(b.id)} disabled={Boolean(opening)} className="flex w-full items-center gap-4 rounded-[20px] bg-gradient-to-br from-[#2B1B5E] to-[#5B2EA6] p-5 text-left text-white shadow-sm">
            <span className={`grid size-14 shrink-0 place-items-center rounded-2xl bg-white/15 text-3xl ${opening === b.id ? "animate-[wiggle_.25s_ease-in-out_infinite]" : ""}`} aria-hidden="true">🎁</span>
            <span className="min-w-0 flex-1"><span className="block text-[17px] font-black">{tierName(b.tier)} mystery box</span><span className="mt-0.5 block text-sm text-white/80">{opening === b.id ? "Opening…" : "You reached a new badge. Tap to see what's inside!"}</span></span>
            <span className="shrink-0 rounded-full bg-[#FF8A05] px-4 py-2 text-sm font-bold">Open</span>
          </button>
        </li>;
        const name = shown?.name ?? b.prizeName ?? "Prize";
        const emoji = shown?.emoji ?? b.emoji;
        const kind = shown?.kind ?? b.kind;
        return <li key={b.id} className="rounded-[20px] bg-white p-5">
          <div className="flex items-center gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#F3EEFF] text-2xl" aria-hidden="true">{emoji}</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-wide text-[#6B3FD1]">{shown ? "You won!" : `${tierName(b.tier)} mystery box`}</p>
              <p className="font-bold">{name}</p>
            </div>
          </div>
          {kind === "partner_ticket" ? <div className="mt-3 rounded-xl bg-[#F7F6F3] p-3 text-sm text-slate-700">
            {b.voucherCode ? <>Your voucher code: <strong className="font-mono text-base tracking-wider">{b.voucherCode}</strong></> : "We'll email you within 2 working days to arrange your date and send your voucher."}
            {b.terms && <p className="mt-1 text-xs text-slate-500">{b.terms}</p>}
            {b.expiresAt && <p className="mt-1 text-xs text-slate-500">Use by {date(b.expiresAt)}{b.fulfilment === "used" ? " · Used" : ""}</p>}
          </div> : <p className="mt-2 text-sm text-slate-600">Added to <strong>My gifts</strong> below. It&apos;s applied automatically when you book signed in.</p>}
        </li>;
      })}
    </ul>
  </section>;
}
