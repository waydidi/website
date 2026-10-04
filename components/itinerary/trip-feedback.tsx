"use client";

import { ExternalLink, LoaderCircle, Star } from "lucide-react";
import { useState } from "react";
import { tripWords, type TripWords } from "@/lib/trip-i18n";

/** After the trip: 1–5 stars and a comment. Happy guests are invited to share a public review. */
export function TripFeedback({ token, rating: savedRating, reviewUrl, words }: { token: string; rating: number | null; reviewUrl: string | null; words?: TripWords }) {
  const w = words ?? tripWords("en");
  const [rating, setRating] = useState(savedRating ?? 0);
  const [comment, setComment] = useState("");
  const [done, setDone] = useState(Boolean(savedRating));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) { setError(w.rateHint); return; }
    setBusy(true); setError("");
    const res = await fetch(`/api/itinerary/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "feedback", rating, comment }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) { setError(((await res?.json().catch(() => ({}))) as { error?: string })?.error ?? w.genericError); return; }
    setDone(true);
  }
  return <section id="feedback" className="scroll-mt-24 rounded-3xl bg-white p-5 shadow-sm sm:p-7">
    <h2 className="text-[20px] font-bold">{done ? w.thanksFeedback : w.howWasDay}</h2>
    {done ? <>
      <p className="mt-2 text-[15px] text-slate-700">{rating >= 4 ? w.happy : w.unhappy}</p>
      {reviewUrl && <a href={reviewUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex h-12 items-center gap-2 rounded-full bg-[#FF8A05] px-6 font-bold text-white"><ExternalLink size={17} />{w.shareGoogle}</a>}
    </> : <form onSubmit={send} className="mt-3 grid gap-3">
      <div className="flex gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => setRating(n)} className="p-1"><Star size={34} className={n <= rating ? "fill-[#FF8A05] text-[#FF8A05]" : "text-slate-300"} /></button>)}
      </div>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1500} placeholder={w.commentPlaceholder} className="min-h-24 w-full rounded-xl border border-slate-300 p-3 text-[16px] outline-none focus:border-[#FF8A05]" aria-label="Comment" />
      <button type="submit" disabled={busy} className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#211726] font-bold text-white disabled:opacity-60">{busy && <LoaderCircle size={17} className="animate-spin" />}{w.send}</button>
      {error && <p role="alert" className="text-[14px] font-semibold text-red-600">{error}</p>}
    </form>}
  </section>;
}
