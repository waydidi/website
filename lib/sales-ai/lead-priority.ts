/** Transparent priority for open enquiries. No profile data or inferred intent. */
export function leadPriority(stage: string, activeQuote: boolean, acceptedQuote: boolean) {
  if (["won", "lost", "cancelled"].includes(stage)) return { score: null, reasons: "" };
  if (stage === "awaiting_payment") return { score: 100, reasons: "Awaiting payment" };
  if (acceptedQuote) return { score: 85, reasons: "Quote accepted" };
  if (activeQuote) return { score: 60, reasons: "Quote still valid" };
  if (stage === "quoted") return { score: 30, reasons: "Previously quoted" };
  return { score: 10, reasons: "New enquiry" };
}
