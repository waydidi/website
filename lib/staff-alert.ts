import { pushLine } from "@/lib/line";
import { sendCard, telegramConfigured } from "@/lib/telegram/client";

/**
 * A staff alert to the LINE staff chat and to the Telegram Admin group, whichever is set up. Never throws: an alert
 * that cannot be delivered must not undo or block what the customer or staff just did.
 */
export async function alertStaff(lineText: string, telegramHtml: string) {
  await pushLine([{ type: "text", text: lineText }]).catch(() => undefined);
  if (telegramConfigured()) await sendCard(telegramHtml).catch((error) => console.error("staff alert (Telegram) failed", error instanceof Error ? error.message : "unknown"));
}
