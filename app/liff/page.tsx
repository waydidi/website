import type { Metadata } from "next";
import Link from "next/link";
import { env } from "cloudflare:workers";
import { LiffEntry } from "@/components/liff/liff-entry";
import { liffChannelId, safeLiffNext } from "@/lib/liff";

export const metadata: Metadata = { title: "Waydidi in LINE", robots: { index: false, follow: false } };

/** LIFF endpoint URL (LINE Developers → LIFF → Endpoint URL: https://waydidi.com/liff). */
export default async function LiffPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const liffId = (env as unknown as Record<string, string | undefined>).LINE_LIFF_ID ?? "";
  const next = safeLiffNext((await searchParams).next);
  return <main className="min-h-screen bg-canvas px-4 py-8 text-plum">
    <div className="mx-auto max-w-liff">
      {liffChannelId(liffId) ? <LiffEntry liffId={liffId} next={next} /> : <p className="rounded-card bg-white p-6 text-center">Waydidi in LINE is not set up yet. Please use <Link className="font-bold text-brand-darker underline" href="/account/trips">waydidi.com</Link>.</p>}
    </div>
  </main>;
}
