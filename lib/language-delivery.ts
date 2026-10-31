import { parseLanguagePath, publicLanguagePath } from './language-urls';

/** The Worker owns these headers: a client cannot opt a private page into translation. */
export function languageDelivery(request: Request, enabled: boolean) {
  const url = new URL(request.url);
  const parsed = parseLanguagePath(url.pathname);
  const headers = new Headers(request.headers);
  headers.delete('x-waydidi-language');
  headers.delete('x-waydidi-public-path');
  if (enabled && parsed.valid && publicLanguagePath(parsed.path)) {
    headers.set('x-waydidi-language', parsed.lang);
    headers.set('x-waydidi-public-path', parsed.path);
    url.pathname = parsed.path;
  }
  return { ...parsed, enabled, request: new Request(url, new Request(request, { headers })) };
}
