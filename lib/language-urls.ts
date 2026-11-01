import { isSiteLang, SITE_LANGS, type SiteLang } from './site-languages';

// Reserve actual ISO 639-1 language codes (plus the conventional unknown `zz`),
// not arbitrary short English route names such as /mcp, /go or /app.
// `en` is reserved too: English's canonical URL is always unprefixed.
const languageSegments = new Set(('aa ab ae af ak am an ar as av ay az ba be bg bh bi bm bn bo br bs ca ce ch co cr cs cu cv cy da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi yo za zh zu zz').split(' '));
const reservedLanguageSegment = (segment: string) => languageSegments.has(segment) || isSiteLang(segment);

// A URL, not a preference cookie, determines the public page language.
export function publicLanguagePath(path: string) {
  try { path=decodeURIComponent(path); } catch { return false; }
  if(!path.startsWith('/') || path.includes('\\') || path.includes('//') || path.split('/').some(s=>s==='.'||s==='..'))return false;
  return !/^\/(api|mcp|admin|admin-setup|driver|drivers\/portal|agency|account|partner|trip|booking|checkout|pay|chat-pay|liff|quote|marketing|itinerary|f|s|webhooks?|_vinext|_next|maintenance)(\/|$)/.test(path)
    && !/\.[a-z0-9]+$/i.test(path);
}
export function parseLanguagePath(path: string): {lang: SiteLang; path: string; prefixed: boolean; valid: boolean} {
  const first = path.split('/')[1];
  if (isSiteLang(first) && first !== 'en') {
    const rest = path.slice(first.length + 1) || '/';
    return {lang:first,path:rest,prefixed:true,valid:publicLanguagePath(rest) && !reservedLanguageSegment(rest.split('/')[1] ?? '')};
  }
  return {lang:'en',path,prefixed:false,valid: !publicLanguagePath(path) || !reservedLanguageSegment(first ?? '')};
}
export function languagePath(value: string, lang: SiteLang) {
  const split = value.search(/[?#]/);
  const path = split < 0 ? value : value.slice(0,split);
  const suffix = split < 0 ? '' : value.slice(split);
  const parsed = parseLanguagePath(path);
  if (!parsed.valid || !publicLanguagePath(parsed.path)) return value;
  return (lang === 'en' ? parsed.path : `/${lang}${parsed.path === '/' ? '' : parsed.path}`) + suffix;
}
/** Full-document navigation avoids asking the app router for a prefixed .rsc endpoint. */
export function languageLinkTarget(href: string, current: string, lang: SiteLang): string | null {
  if (!href || href.startsWith('#')) return null;
  try {
    const base = new URL(current), target = new URL(href,base);
    const parsed = parseLanguagePath(target.pathname);
    if (target.origin !== base.origin || !parsed.valid || !publicLanguagePath(parsed.path)) return null;
    target.pathname = languagePath(target.pathname,lang);
    return target.toString();
  } catch { return null; }
}

export function languageAlternates(path: string, origin: string): Record<string,string> {
  return Object.fromEntries([...SITE_LANGS.map(l => [l.htmlLang,origin+languagePath(path,l.code)]),['x-default',origin+languagePath(path,'en')]]);
}
