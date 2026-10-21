import sources from "@/lib/site-translation-sources.json";

// Text written in page source can contain HTML entities (&apos; &amp; &quot;): the browser shows, and sends, the
// decoded text ("flight's"), so the approved list also holds the decoded form. Without it, any line with an
// apostrophe or ampersand was refused and stayed in English.
const ENTITIES: Record<string, string> = { "&apos;": "'", "&#39;": "'", "&quot;": '"', "&amp;": "&", "&lt;": "<", "&gt;": ">", "&nbsp;": " " };
export const decodeEntities = (text: string) => text.replace(/&(?:apos|#39|quot|amp|lt|gt|nbsp);/g, (m) => ENTITIES[m] ?? m);

const approved = new Set<string>();
for (const text of sources) { approved.add(text); const plain = decodeEntities(text); if (plain !== text) approved.add(plain); }

/** Exact repository-authored copy only; never approve text from a visitor or database record. */
export const approvedTranslationText = (text: string) => approved.has(text);
