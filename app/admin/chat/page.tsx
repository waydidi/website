"use client";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChatInbox } from "@/components/chat-admin/inbox";
import { TelegramTeam } from "@/components/chat-admin/telegram-team";

export default function ChatPage() {
  const tab = useSearchParams().get("tab");
  return <main className="px-4 py-5 sm:px-8">
    <h1 className="sr-only">Website chat</h1>
    <nav className="mb-4 flex gap-2 text-[14px] font-semibold" aria-label="Chat sections">
      {[["", "Inbox"], ["telegram", "Telegram team"]].map(([k, l]) => <Link key={k} href={k ? `/admin/chat?tab=${k}` : "/admin/chat"} aria-current={(tab ?? "") === k ? "page" : undefined}
        className={`rounded-full px-4 py-2 ${(tab ?? "") === k ? "bg-[#FFF0DF] text-[#C96100]" : "text-slate-600 hover:bg-slate-100"}`}>{l}</Link>)}
    </nav>
    {tab === "telegram" ? <TelegramTeam /> : <ChatInbox />}
  </main>;
}
