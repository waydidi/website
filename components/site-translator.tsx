"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LANG_COOKIE, SITE_LANGS, TX_ATTRS, TX_SKIP, isSiteLang, legalPath, untranslatedPath, usableText, type SiteLang } from "@/lib/site-languages";

// Shows every public page in the visitor's language. The page is rendered in English; this swaps
// its text (and placeholders, labels, alt text, title) for cached AI translations, and keeps
// doing so as the page changes. Only text nodes' values are changed, so React keeps working.

const SKIP = TX_SKIP;
const ATTRS = TX_ATTRS;

export function siteLang(): SiteLang {
  try {
    const v = document.cookie.split("; ").find((c) => c.startsWith(`${LANG_COOKIE}=`))?.slice(LANG_COOKIE.length + 1);
    return isSiteLang(v) ? v : "en";
  } catch { return "en"; }
}

export function SiteTranslator() {
  const path = usePathname() ?? "/";
  const [lang, setLang] = useState<SiteLang>("en");
  const [original, setOriginal] = useState(false);
  useEffect(() => { const t = window.setTimeout(() => setLang(siteLang()), 0); return () => window.clearTimeout(t); }, []);
  const active = lang !== "en" && !untranslatedPath(path) && !original;

  useEffect(() => {
    const done = () => document.documentElement.classList.remove("wd-tx");
    if (!active) { done(); return; }
    const info = SITE_LANGS.find((l) => l.code === lang)!;
    const prevLang = document.documentElement.lang;
    document.documentElement.lang = info.htmlLang;

    let cache: Record<string, string> = {};
    const key = `wd-tx2:${lang}`; // v2: earlier versions saved untranslated text here
    try { cache = JSON.parse(sessionStorage.getItem(key) ?? "{}"); } catch { cache = {}; }
    const textOrig = new WeakMap<Text, { src: string; shown: string }>();
    const attrOrig = new WeakMap<Element, Record<string, { src: string; shown: string }>>();
    const touchedText = new Set<Text>(), touchedAttr = new Set<Element>();
    const pending = new Set<string>();
    // Texts that couldn't be translated yet: shown in English for now and tried again shortly (not saved).
    const skip = new Set<string>();
    let retries = 0;
    let timer = 0, stopped = false, firstDone = false;
    let titleSrc = document.title, titleShown = "";

    const usable = usableText;
    // A function replacer, so "$&" or "$1" in a translation is shown as written.
    const wrap = (full: string, core: string, tr: string) => full.replace(core, () => tr);
    const skipped = (el: Element | null) => !el || Boolean(el.closest(SKIP));

    function applyText(node: Text) {
      const rec = textOrig.get(node);
      // React (or anything) changed the text since we translated it: that's the new English.
      const src = rec && node.nodeValue === rec.shown ? rec.src : node.nodeValue ?? "";
      const core = usable(src);
      if (!core) return;
      const tr = cache[core];
      if (tr === undefined) { if (!skip.has(core)) pending.add(core); textOrig.set(node, { src, shown: src }); return; }
      const shown = wrap(src, core, tr);
      textOrig.set(node, { src, shown }); touchedText.add(node);
      if (node.nodeValue !== shown) node.nodeValue = shown;
    }
    function applyAttrs(el: Element) {
      for (const a of ATTRS) {
        const v = el.getAttribute(a);
        if (v === null) continue;
        const recs = attrOrig.get(el) ?? {};
        const src = recs[a] && v === recs[a].shown ? recs[a].src : v;
        const core = usable(src);
        if (!core) continue;
        const tr = cache[core];
        if (tr === undefined) { if (!skip.has(core)) pending.add(core); recs[a] = { src, shown: src }; attrOrig.set(el, recs); continue; }
        recs[a] = { src, shown: wrap(src, core, tr) }; attrOrig.set(el, recs); touchedAttr.add(el);
        if (v !== recs[a].shown) el.setAttribute(a, recs[a].shown);
      }
    }
    function walk(root: Node) {
      if (root.nodeType === Node.TEXT_NODE) { if (!skipped(root.parentElement)) applyText(root as Text); return; }
      if (!(root instanceof Element) || skipped(root)) return;
      applyAttrs(root);
      const it = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (n instanceof Element && n.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
      });
      for (let n = it.nextNode(); n; n = it.nextNode()) { if (n.nodeType === Node.TEXT_NODE) applyText(n as Text); else applyAttrs(n as Element); }
    }
    function applyTitle() {
      if (document.title !== titleShown) titleSrc = document.title;
      const core = usable(titleSrc);
      if (!core) return;
      if (cache[core] === undefined) { if (!skip.has(core)) pending.add(core); return; }
      titleShown = wrap(titleSrc, core, cache[core]);
      if (document.title !== titleShown) document.title = titleShown;
    }

    async function flush() {
      timer = 0;
      const texts = [...pending]; pending.clear();
      for (let i = 0; i < texts.length && !stopped; i += 120) {
        const res = await fetch("/api/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lang, path, texts: texts.slice(i, i + 120) }) })
          .then((r) => (r.ok ? r.json() : { translations: {} })).catch(() => ({ translations: {} })) as { translations: Record<string, string> };
        Object.assign(cache, res.translations);
      }
      try { sessionStorage.setItem(key, JSON.stringify(cache)); } catch { /* storage full or blocked */ }
      if (stopped) return;
      const missed = texts.filter((t) => cache[t] === undefined);
      for (const t of missed) skip.add(t);
      if (missed.length && retries < 3) { retries++; window.setTimeout(() => { if (stopped) return; skip.clear(); observer.disconnect(); walk(document.body); applyTitle(); observe(); schedule(); }, 8000 * retries); }
      observer.disconnect(); walk(document.body); applyTitle(); observe();
      if (!firstDone) { firstDone = true; done(); }
    }
    const schedule = () => { if (pending.size && !timer) timer = window.setTimeout(() => void flush(), 60); else if (!pending.size && !firstDone) { firstDone = true; done(); } };

    const observer = new MutationObserver((records) => {
      observer.disconnect();
      for (const r of records) {
        if (r.type === "characterData") { if (!skipped(r.target.parentElement)) applyText(r.target as Text); }
        else if (r.type === "attributes") { if (!skipped(r.target as Element)) applyAttrs(r.target as Element); }
        else r.addedNodes.forEach(walk);
      }
      applyTitle(); observe(); schedule();
    });
    const observe = () => {
      observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
      const head = document.querySelector("title");
      if (head) observer.observe(head, { childList: true, characterData: true, subtree: true });
    };
    walk(document.body); applyTitle(); observe(); schedule();

    return () => {
      // Back to English (language switched off, "Show original", or a staff page).
      stopped = true; observer.disconnect(); if (timer) window.clearTimeout(timer);
      for (const n of touchedText) { const r = textOrig.get(n); if (r && n.nodeValue === r.shown) n.nodeValue = r.src; }
      for (const el of touchedAttr) for (const [a, r] of Object.entries(attrOrig.get(el) ?? {})) if (el.getAttribute(a) === r.shown) el.setAttribute(a, r.src);
      if (titleShown && document.title === titleShown) document.title = titleSrc;
      document.documentElement.lang = prevLang; done();
    };
  }, [active, lang, path]);

  if (lang === "en" || untranslatedPath(path)) return null;
  return <div translate="no" className="notranslate fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 z-[70] max-w-[min(86vw,360px)] rounded-2xl border border-slate-200 bg-white/95 px-3 py-2 text-[12px] leading-snug text-slate-600 shadow-sm backdrop-blur">
    {original ? "Showing the original English." : <>Translated by AI.{legalPath(path) ? " The English version is the official text." : ""}</>}{" "}
    <button type="button" onClick={() => setOriginal((v) => !v)} className="font-semibold text-[#C96100] underline-offset-2 hover:underline">{original ? `Show ${SITE_LANGS.find((l) => l.code === lang)?.label}` : "Show original"}</button>
  </div>;
}
