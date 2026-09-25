// The worker keeps blog pages in the edge cache for 5 minutes. After an admin
// saves, drop the affected pages so the change shows straight away.
export async function purgeBlogCache(origin: string, slugs: string[] = []) {
  const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  if (!cache) return;
  const paths = ["/blog", ...slugs.filter(Boolean).map((s) => `/blog/${s}`)];
  const urls = ["", "/th", "/zh"].flatMap((prefix) => paths.map((p) => `${origin}${prefix}${p}`));
  await Promise.all(urls.map((u) => cache.delete(u).catch(() => false)));
}
