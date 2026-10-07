"use client";
import { useSearchParams } from "next/navigation";
import { ChatInbox } from "@/components/chat-admin/inbox";
import { TelegramTeam } from "@/components/chat-admin/telegram-team";
import { SupportReviews } from "@/components/chat-admin/support-reviews";
import { CeeKnowledge } from "@/components/chat-admin/cee-knowledge";
import { ChatAlerts } from "@/components/chat-admin/alerts";

export default function ChatPage() {
  const tab = useSearchParams().get("tab");
  return <main className="px-4 py-5 sm:px-8">
    <h1 className="sr-only">Website chat</h1>
    {tab === "cee" ? <CeeKnowledge /> : tab === "alerts" ? <ChatAlerts /> : tab === "telegram" ? <TelegramTeam /> : tab === "reviews" ? <SupportReviews /> : <ChatInbox />}
  </main>;
}
