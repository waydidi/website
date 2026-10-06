import sources from "@/lib/site-translation-sources.json";
const approved = new Set(sources);
/** Exact repository-authored copy only; never approve text from a visitor or database record. */
export const approvedTranslationText = (text: string) => approved.has(text);
