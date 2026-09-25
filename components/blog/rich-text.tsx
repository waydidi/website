import Link from "next/link";
import type { ReactNode } from "react";

// Inline markup used in guide paragraphs, lists and tips: **bold** and [text](url).
// Only site paths (/…) and http(s) links are turned into links.
const TOKEN = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function RichText({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const i = m.index ?? 0;
    if (i > last) out.push(text.slice(last, i));
    if (m[1]) out.push(<strong key={i} className="font-semibold text-[#1C1C1C]">{m[1]}</strong>);
    else {
      const [label, href] = [m[2], m[3]];
      const cls = "font-medium text-[#C96100] underline underline-offset-2 hover:text-[#E07400]";
      if (href.startsWith("/") && !href.startsWith("//")) out.push(<Link key={i} href={href} className={cls}>{label}</Link>);
      else if (/^https?:\/\//i.test(href)) out.push(<a key={i} href={href} target="_blank" rel="noopener noreferrer" className={cls}>{label}</a>);
      else out.push(label);
    }
    last = i + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

/** Plain text without markup (for word counts and descriptions). */
export const plainText = (text: string) => text.replace(TOKEN, (_m, bold, label) => bold ?? label ?? "");
