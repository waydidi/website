import { languageAlternates, languagePath, parseLanguagePath } from './language-urls';
import { SITE_LANGS, usableText, type SiteLang } from './site-languages';
import { approvedTranslationText } from './site-translation-policy';

// The project intentionally uses DOM types rather than the full Workers global type set.
// Declare only the streaming HTMLRewriter surface used here; the runtime is Cloudflare's.
type HtmlElement = {
  tagName: string;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
  setAttribute(name: string, value: string): void;
  onEndTag(handler: () => void): void;
  remove(): void;
  append(content: string, options: {html: boolean}): void;
};
type HtmlText = {text: string; lastInTextNode: boolean; remove(): void; replace(content: string): void};
type HtmlRewriter = {
  on(selector: string, handlers: {element(el: HtmlElement): void}): HtmlRewriter;
  onDocument(handlers: {text(chunk: HtmlText): void}): HtmlRewriter;
  transform(response: Response): Response;
};
declare const HTMLRewriter: {new(): HtmlRewriter};

const escape = (s: string) => s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
// React SSR emits numeric references and these named references in text nodes.
// Decode once for the same keys the browser's textContent-based translator uses.
const decodeText = (s: string) => s.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (raw, entity: string) => {
  if (entity[0] !== '#') return ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:'\u00a0'} as Record<string,string>)[entity.toLowerCase()] ?? raw;
  const value = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2),16) : parseInt(entity.slice(1),10);
  return value > 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff) ? String.fromCodePoint(value) : '\ufffd';
});
const attrs = ['placeholder','aria-label','title','alt'];
const core = (s: string) => { const t=usableText(s); return t && approvedTranslationText(t) ? t : null; };

/** Cache reads only: a crawler request never calls a model or claims translation budget. */
export async function localizePublicHtml(response: Response, page: {lang: SiteLang; path: string; origin: string}, cached: (lang: SiteLang, texts: string[]) => Promise<Map<string,string>>) {
  if (response.status !== 200 || !response.headers.get('content-type')?.includes('text/html')) return response;
  const html = await response.text();
  const texts = new Set<string>();
  // Remember full nodes during collection so cache misses can pass through untouched,
  // even when HTMLRewriter delivers a node as multiple streaming chunks.
  const nodes: string[] = [];
  // Robots and canonical as the page itself declared them, read in the collection pass.
  const noindexRule = (v: string | null) => /(^|[\s,:])(noindex|none)(\s|,|$)/i.test(v ?? '');
  let noindex = noindexRule(response.headers.get('x-robots-tag')), pageCanonical: string | null = null;
  const scan = (translations?: Map<string,string>) => {
    let skipped = 0, buffer = '', nodeIndex = 0;
    const rewriter = new HTMLRewriter().on('*', {
      element(el) {
        const skip = ['script','style','noscript','code','pre','textarea','svg'].includes(el.tagName) || el.getAttribute('translate') === 'no' || el.hasAttribute('data-no-translate') || (el.getAttribute('class') ?? '').split(/\s+/).includes('notranslate');
        if (skip && !['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'].includes(el.tagName)) { skipped++; el.onEndTag(()=>{skipped--;}); }
        if (!translations && el.tagName === 'meta' && ['robots','googlebot'].includes((el.getAttribute('name') ?? '').toLowerCase()) && noindexRule(el.getAttribute('content'))) noindex = true;
        if (!translations && el.tagName === 'link' && el.getAttribute('rel') === 'canonical' && pageCanonical === null) pageCanonical = el.getAttribute('href');
        if (el.tagName === 'meta' && ['description','og:title','og:description'].includes(el.getAttribute('name') ?? el.getAttribute('property') ?? '')) {
          const value=el.getAttribute('content');const t=value && core(value);if(t) texts.add(t);
        }
        if (!skipped && !skip) for (const attr of attrs) {
          const value = el.getAttribute(attr); const t=value && core(value);
          if (t) { texts.add(t); if (translations?.has(t)) el.setAttribute(attr,value!.replace(t,()=>translations.get(t)!)); }
        }
      },
    }).onDocument({text(chunk) {
      if (skipped) return;
      if (translations) {
        const value = nodes[nodeIndex], t = core(value);
        // A miss must not call replace: it would escape the original SSR entities again.
        if (t && translations.has(t)) {
          if (chunk.lastInTextNode) chunk.replace(value.replace(t,()=>translations.get(t)!));
          else chunk.remove();
        }
        if (chunk.lastInTextNode) nodeIndex++;
        return;
      }
      buffer += chunk.text;
      if (!chunk.lastInTextNode) return;
      const value=decodeText(buffer);buffer='';nodes.push(value);const t=core(value);
      if (t) texts.add(t);
    }});
    return rewriter;
  };
  await scan().transform(new Response(html)).text();
  const translations = page.lang === 'en' ? new Map<string,string>() : await cached(page.lang,[...texts]).catch(()=>new Map<string,string>());
  // One canonical per page, consistent with the language prefix and hreflang set. A page-supplied
  // canonical on this site that points at another page is kept (localized); one on another site is
  // kept as-is without alternates. Noindex pages get neither, so they never point at indexable duplicates.
  let target: string | null = page.path, canonical: string | null = null;
  try {
    const declared = pageCanonical ? new URL(pageCanonical, page.origin) : null;
    if (declared && declared.origin !== page.origin) { target = null; canonical = declared.toString(); }
    else if (declared) target = parseLanguagePath(declared.pathname).path;
  } catch { /* unparseable: fall back to self */ }
  if (target !== null) canonical = page.origin + languagePath(target,page.lang);
  const tags = noindex || !canonical ? '' : `<link rel="canonical" href="${escape(canonical)}">` + (target === null ? '' : Object.entries(languageAlternates(target,page.origin)).map(([lang,url])=>`<link rel="alternate" hreflang="${lang}" href="${escape(url)}">`).join(''));
  const seed = JSON.stringify(Object.fromEntries(translations)).replaceAll('<','\\u003c');
  const rewriter = scan(translations)
    .on('html',{element(el){el.setAttribute('lang',SITE_LANGS.find(l=>l.code===page.lang)!.htmlLang);el.setAttribute('data-url-language',page.lang);}})
    .on('link[rel="canonical"],link[hreflang]',{element(el){el.remove();}})
    .on('meta[property="og:url"]',{element(el){if(!noindex && canonical) el.setAttribute('content',canonical);}})
    .on('meta[name="description"],meta[property="og:title"],meta[property="og:description"]',{element(el){const v=el.getAttribute('content');if(v && translations.has(v)) el.setAttribute('content',translations.get(v)!);}})
    .on('a[href]',{element(el){const href=el.getAttribute('href')!;if(href.startsWith('/')&&!href.startsWith('//'))el.setAttribute('href',languagePath(href,page.lang));}})
    .on('head',{element(el){el.append(tags+`<script type="application/json" id="wd-url-translations">${seed}</script>`,{html:true});}});
  const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('etag');headers.set('Content-Language',page.lang);
  return rewriter.transform(new Response(html,{status:response.status,headers}));
}
