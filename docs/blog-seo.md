# Blog SEO: Search Console setup and how guide bookings are counted

## Google Search Console (one-time)
1. Go to https://search.google.com/search-console and choose **Add property → Domain**.
2. Enter the live domain (the one in `SITE_URL`, `lib/public-content.ts`), not the `*.workers.dev` address — that address sends `X-Robots-Tag: noindex` on purpose.
3. Verify with the DNS TXT record Google gives you (add it in Cloudflare DNS).
4. In **Sitemaps**, submit `https://<your-domain>/sitemap.xml`. It lists every published guide and topic page.
5. After publishing a new guide, paste its URL into **URL inspection → Request indexing** to speed things up.
6. Check **Performance** monthly: queries with many impressions but a low click rate usually need a clearer title or meta description.
7. **Enhancements** shows FAQ and breadcrumb results; fix anything marked invalid there.

## Writing checklist (editor → "SEO checklist")
Set a focus keyword per guide (the phrase travellers type, e.g. "Bangkok to Hua Hin"). Aim for green on most checks; amber is fine when the advice doesn't fit the guide.

## Guide → booking tracking
The booking card and "Book this ride" button add `ref=blog:<slug>` to the search link. The site remembers it for that browser tab and saves it with the booking in `booking_sources`. Admin → Blog shows "N bookings" on each guide. Renaming a guide's permalink starts a new count under the new slug.
