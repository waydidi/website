import type { Metadata } from "next";
import ConfirmationClient from "./confirmation-client";

export const metadata: Metadata = { title: "Booking confirmation · Waydidi", robots: { index: false, follow: false } };

export default async function ConfirmationPage({ params, searchParams }: { params: Promise<{ reference: string }>; searchParams: Promise<{ token?: string; session_id?: string }> }) {
  const { reference } = await params;
  const { token = "", session_id: sessionId = "" } = await searchParams;
  return <ConfirmationClient reference={reference} token={token} sessionId={sessionId} />;
}
