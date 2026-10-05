import { NextResponse } from "next/server";
import { chatPaymentLink, chatPaymentTestMode, markChatPaymentPaid, paysoCheckoutUrl } from "@/lib/chat-pay";
import { isJsonRequest, sameOrigin } from "@/lib/security";

// Pay a chat payment link: "pay" sends the customer to Pay Solutions; "test_pay" (test mode only)
// confirms without charging, to try the whole flow.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked." }, { status: 403 });
  const { id } = await params;
  const link = await chatPaymentLink(id);
  if (!link) return NextResponse.json({ error: "Payment link not found." }, { status: 404 });
  if (link.status !== "pending") return NextResponse.json({ error: link.status === "paid" ? "This booking is already paid." : "This payment link has expired. Ask in the chat for a new one." }, { status: 410 });
  const input = await request.json().catch(() => ({})) as { action?: string };
  if (input.action === "test_pay") {
    if (!chatPaymentTestMode()) return NextResponse.json({ error: "Test payments are switched off." }, { status: 403 });
    const r = await markChatPaymentPaid(id, "test");
    return r.ok ? NextResponse.json({ ok: true, reference: r.reference }) : NextResponse.json({ error: r.reason }, { status: 409 });
  }
  try {
    const url = await paysoCheckoutUrl(link);
    if (!url) return NextResponse.json({ error: "Online payment isn't available yet. Please reply in the chat and our team will help." }, { status: 503 });
    return NextResponse.json({ url });
  } catch {
    return NextResponse.json({ error: "Payment couldn't be started. Please try again or reply in the chat." }, { status: 503 });
  }
}
