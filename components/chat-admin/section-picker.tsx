"use client";

import { Check, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { DropdownMenu } from "radix-ui";

export const CHAT_SECTIONS: [string, string][] = [["", "Inbox"], ["cee", "Non knowledge"], ["alerts", "Alerts & limits"], ["reviews", "Support reviews"], ["telegram", "Telegram team"]];

/** One pill next to the "Website chat" title: shows the section you're in, tap to pick another. */
export function ChatSectionPicker() {
  const tab = useSearchParams().get("tab") ?? "";
  const [open, setOpen] = useState(false);
  const current = CHAT_SECTIONS.find(([k]) => k === tab) ?? CHAT_SECTIONS[0];
  return <DropdownMenu.Root open={open} onOpenChange={setOpen}>
    <DropdownMenu.Trigger aria-label={`Chat section: ${current[1]}`}
      className="inline-flex h-10 items-center gap-1.5 rounded-full bg-brand-tint px-4 text-[14px] font-semibold text-brand-darker outline-none hover:bg-[#FFE6CC] focus-visible:ring-2 focus-visible:ring-brand">
      {current[1]}<ChevronDown size={16} className={`transition ${open ? "rotate-180" : ""}`} />
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content align="start" sideOffset={6} aria-label="Chat sections" className="z-40 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1.5 shadow-lg">
        {CHAT_SECTIONS.map(([k, l]) => <DropdownMenu.Item key={k} asChild>
          <Link href={k ? `/admin/chat?tab=${k}` : "/admin/chat"} aria-current={k === current[0] ? "page" : undefined}
            className={`flex items-center justify-between px-4 py-2.5 text-[14px] outline-none data-[highlighted]:bg-slate-50 ${k === current[0] ? "font-semibold text-brand-darker" : "text-slate-700"}`}>{l}{k === current[0] && <Check size={16} />}</Link>
        </DropdownMenu.Item>)}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>;
}
