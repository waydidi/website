import { isSiteLang, SITE_LANGS, type SiteLang } from './site-languages';

// A URL, not a preference cookie, determines the public page language.
export function publicLanguagePath(path: string) {
  try { path=decodeURIComponent(path); } catch { return false; }
  if(!path.startsWith('/') || path.includes('\\') || path.includes('//') || path.split('/').some(s=>s==='.'||s==='..'))return false;
  return !/^\/(api|admin|admin-setup|driver|drivers\/portal|agency|account|partner|trip|booking|checkout|pay|chat-pay|liff|quote|marketing|itinerary|f|s|webhooks?|_vinext|_next|maintenance)(\/|$)/.test(path)
    && !/\.[a-z0-9]+$/i.test(path);
}
export function parseLanguagePath(path: string): {lang: SiteLang; path: string; prefixed: boolean; valid: boolean} {
  const first = path.split('/')[1];
  if (isSiteLang(first) && first !== 'en') {
    const rest = path.slice(first.length + 1) || '/';
    return {lang:first,path:rest,prefixed:true,valid:publicLanguagePath(rest) && (!/^[a-z]{2,3}$/.test(rest.split('/')[1] ?? '') || rest.split('/')[1] === 'faq')};
  }
  return {lang:'en',path,prefixed:false,valid: !publicLanguagePath(path) || !/^[a-z]{2,3}$/.test(first ?? '') || first === 'faq'};
}
export function languagePath(value: string, lang: SiteLang) {
  const split = value.search(/[?#]/);
  const path = split < 0 ? value : value.slice(0,split);
  const suffix = split < 0 ? '' : value.slice(split);
  const parsed = parseLanguagePath(path);
  if (!parsed.valid || !publicLanguagePath(parsed.path)) return value;
  return (lang === 'en' ? parsed.path : `/${lang}${parsed.path === '/' ? '' : parsed.path}`) + suffix;
}
export function languageAlternates(path: string, origin: string): Record<string,string> {
  return Object.fromEntries([...SITE_LANGS.map(l => [l.htmlLang,origin+languagePath(path,l.code)]),['x-default',origin+languagePath(path,'en')]]);
}
