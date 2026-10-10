import { SITE_LANGS, isSiteLang, type SiteLang } from "@/lib/site-languages";

/** The visitor's language: ?lang=, then the site language they chose, then their browser's. */
export function tripLanguage(param: string | undefined, cookie: string | undefined, acceptLanguage: string | null): SiteLang {
  if (isSiteLang(param)) return param;
  if (isSiteLang(cookie)) return cookie;
  const wanted = (acceptLanguage ?? "").split(",")
    .map((part) => { const [tag, q] = part.trim().split(";q="); return { tag: tag.toLowerCase(), q: q ? Number(q) : 1 }; })
    .filter((p) => p.tag && p.q > 0).sort((a, b) => b.q - a.q);
  for (const { tag } of wanted) {
    const base = tag.split("-")[0];
    const match = SITE_LANGS.find((l) => l.code === base || l.htmlLang.toLowerCase() === tag || (base === "tl" && l.code === "fil"));
    if (match) return match.code;
  }
  return "en";
}
