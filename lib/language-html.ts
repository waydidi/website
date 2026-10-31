import { languageAlternates, languagePath } from './language-urls';
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
const attrs = ['placeholder','aria-label','title','alt'];
const core = (s: string) => { const t=usableText(s); return t && approvedTranslationText(t) ? t : null; };

/** Cache reads only: a crawler request never calls a model or claims translation budget. */
export async function localizePublicHtml(response: Response, page: {lang: SiteLang; path: string; origin: string}, cached: (lang: SiteLang, texts: string[]) => Promise<Map<string,string>>) {
  if (response.status !== 200 || !response.headers.get('content-type')?.includes('text/html')) return response;
  const html = await response.text();
  const texts = new Set<string>();
  const scan = (translations?: Map<string,string>) => {
    let skipped = 0, buffer = '';
    const rewriter = new HTMLRewriter().on('*', {
      element(el) {
        const skip = ['script','style','noscript','code','pre','textarea','svg'].includes(el.tagName) || el.getAttribute('translate') === 'no' || el.hasAttribute('data-no-translate') || (el.getAttribute('class') ?? '').split(/\s+/).includes('notranslate');
        if (skip && !['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'].includes(el.tagName)) { skipped++; el.onEndTag(()=>{skipped--;}); }
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
      buffer += chunk.text;
      if (!chunk.lastInTextNode) { if (translations) chunk.remove(); return; }
      const value=buffer;buffer='';const t=core(value);
      if (t) texts.add(t);
      if (translations) chunk.replace(t && translations.has(t) ? value.replace(t,()=>translations.get(t)!) : value);
    }});
    return rewriter;
  };
  await scan().transform(new Response(html)).text();
  const translations = page.lang === 'en' ? new Map<string,string>() : await cached(page.lang,[...texts]).catch(()=>new Map<string,string>());
  const canonical = page.origin + languagePath(page.path,page.lang);
  const tags = `<link rel="canonical" href="${escape(canonical)}">` + Object.entries(languageAlternates(page.path,page.origin)).map(([lang,url])=>`<link rel="alternate" hreflang="${lang}" href="${escape(url)}">`).join('');
  const seed = JSON.stringify(Object.fromEntries(translations)).replaceAll('<','\\u003c');
  const rewriter = scan(translations)
    .on('html',{element(el){el.setAttribute('lang',SITE_LANGS.find(l=>l.code===page.lang)!.htmlLang);el.setAttribute('data-url-language',page.lang);}})
    .on('link[rel="canonical"],link[hreflang]',{element(el){el.remove();}})
    .on('meta[property="og:url"]',{element(el){el.setAttribute('content',canonical);}})
    .on('meta[name="description"],meta[property="og:title"],meta[property="og:description"]',{element(el){const v=el.getAttribute('content');if(v && translations.has(v)) el.setAttribute('content',translations.get(v)!);}})
    .on('a[href]',{element(el){const href=el.getAttribute('href')!;if(href.startsWith('/')&&!href.startsWith('//'))el.setAttribute('href',languagePath(href,page.lang));}})
    .on('head',{element(el){el.append(tags+`<script type="application/json" id="wd-url-translations">${seed}</script>`,{html:true});}});
  const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('etag');headers.set('Content-Language',page.lang);
  return rewriter.transform(new Response(html,{status:response.status,headers}));
}
