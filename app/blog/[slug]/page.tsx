import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ArrowRight, Check, ChevronDown, ChevronRight, Lightbulb } from "lucide-react";
import { PublicFooter } from "@/components/public-footer";
import { BlogCover, formatBlogDate } from "@/components/blog/blog-cover";
import { categoryLabel, categorySlug, postBlocks, postHeadings, readingMinutes, routeHref, type BlogPost } from "@/lib/blog-posts";
import { publishedPost, publishedPosts, renamedSlug } from "@/lib/blog-store";
import { plainText, RichText } from "@/components/blog/rich-text";
import { ShareButtons } from "@/components/blog/share-buttons";
import { ArticleBar } from "@/components/blog/article-bar";
import { getWaydidiAdmin } from "@/lib/admin";
import { SITE_URL } from "@/lib/public-content";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const post = await publishedPost((await params).slug);
  if (!post) return { title: "Guide not found | Waydidi" };
  return {
    title: `${post.seoTitle || post.title} | Waydidi`,
    description: post.seoDescription || post.excerpt,
    alternates: { canonical: `${SITE_URL}/blog/${post.slug}` },
    openGraph: { title: post.title, description: post.excerpt, url: `${SITE_URL}/blog/${post.slug}`, type: "article", publishedTime: post.date, modifiedTime: post.updated, images: [absolute(post.cover.photo || "/waydidi-logo.png")] },
    twitter: { card: post.cover.photo ? "summary_large_image" : "summary", title: post.title, description: post.excerpt, images: [absolute(post.cover.photo || "/waydidi-logo.png")] },
  };
}

const absolute = (src: string) => (/^https?:\/\//.test(src) ? src : `${SITE_URL}${src.startsWith("/") ? "" : "/"}${src}`);

function BookingCard({ post }: { post: BlogPost }) {
  if (!post.route) return null;
  const hourly = post.route.service === "hourly";
  return <aside className="my-8 rounded-[20px] border border-[#FFD8AE] bg-[#FFF6EB] p-5" aria-label="Book this ride">
    <p className="text-[13px] font-semibold uppercase tracking-wide text-[#C96100]">{hourly ? "Private driver by the hour" : "Private transfer"}</p>
    <p className="mt-1 text-[20px] font-bold">{post.route.label}</p>
    <ul className="mt-3 grid gap-1.5 text-[15px] text-[#4A4A4A]">
      {["Fixed price, agreed before you book", "Free cancellation up to 24 hours before pickup", "Meet & Greet with your name sign"].map((line) => <li key={line} className="flex items-center gap-2"><Check size={16} className="shrink-0 text-[#0E9F6E]" aria-hidden="true" />{line}</li>)}
    </ul>
    <Link href={routeHref(post.route, post.slug)} className="mt-4 flex h-12 items-center justify-center gap-2 rounded-full bg-[#FF8A05] text-[16px] font-semibold text-white hover:bg-[#F07A00]">See prices <ArrowRight size={18} aria-hidden="true" /></Link>
  </aside>;
}

export default async function BlogArticle({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string }> }) {
  // Drafts and scheduled posts are visible to signed-in admins with ?preview=1.
  const preview = (await searchParams).preview === "1" && Boolean(await getWaydidiAdmin().catch(() => null));
  const slug = (await params).slug;
  const post = await publishedPost(slug, preview);
  if (!post) {
    const moved = await renamedSlug(slug);
    if (moved) permanentRedirect(`/blog/${moved}`);
    notFound();
  }
  const related = (await publishedPosts()).filter((p) => p.slug !== post.slug && p.categories.some((c) => post.categories.includes(c))).slice(0, 3);
  const blocks = postBlocks(post);
  const url = `${SITE_URL}/blog/${post.slug}`;
  const headings = postHeadings(blocks);
  const headingIds = new Map(headings.map((h) => [h.index, h.id]));
  const firstCategory = post.categories[0];
  const publisher = { "@type": "Organization", name: "Waydidi", url: SITE_URL, logo: { "@type": "ImageObject", url: absolute("/waydidi-logo.png") } };
  const faqs = blocks.flatMap((b) => (b.type === "faq" ? b.items : []));
  const jsonLd = [
    { "@context": "https://schema.org", "@type": "Article", headline: post.title, description: post.excerpt, image: [absolute(post.cover.photo || "/waydidi-logo.png")], datePublished: post.date, dateModified: post.updated && post.updated > post.date ? post.updated : post.date, author: { "@type": "Organization", name: post.author || "Waydidi team", url: `${SITE_URL}/blog` }, publisher, mainEntityOfPage: url },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Travel guides", item: `${SITE_URL}/blog` },
      { "@type": "ListItem", position: 3, name: post.title, item: url },
    ] },
    ...(faqs.length ? [{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: plainText(f.a) } })) }] : []),
  ];

  return <main className="font-home bg-white text-[#1C1C1C]">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    {preview && <p className="bg-sky-600 px-5 py-2 text-center text-sm font-semibold text-white">Preview — only admins can see this until it's published.</p>}
    <article className="mx-auto max-w-[760px] px-5 pb-12 pt-6">
      <nav aria-label="Breadcrumb"><ol className="flex min-w-0 items-center gap-1 text-[14px] text-[#6B6B6B]">
        <li><Link href="/" className="hover:text-[#1C1C1C]">Home</Link></li>
        <li aria-hidden="true"><ChevronRight size={14} /></li>
        <li><Link href="/blog" className="hover:text-[#1C1C1C]">Travel guides</Link></li>
        {firstCategory && <><li aria-hidden="true"><ChevronRight size={14} /></li><li className="truncate"><Link href={`/blog/category/${categorySlug(firstCategory)}`} className="hover:text-[#1C1C1C]">{categoryLabel(firstCategory)}</Link></li></>}
      </ol></nav>
      <div className="mt-4"><BlogCover post={post} chips={false} /></div>
      <div className="mt-5 flex flex-wrap gap-x-3 text-[14px] italic text-[#E07400]">{post.categories.map((c) => <Link key={c} href={`/blog/category/${categorySlug(c)}`} className="hover:underline">{categoryLabel(c)}</Link>)}</div>
      <h1 className="mt-2 text-[28px] font-bold leading-[1.2] tracking-[-.02em]">{post.title}</h1>
      <p className="mt-2 text-[14px] text-[#8A8A8A]">{post.date ? formatBlogDate(post.date) : "Draft"}{post.updated && post.date && post.updated > post.date ? ` · Updated ${formatBlogDate(post.updated)}` : ""} · {readingMinutes(post)} min read{post.author ? ` · ${post.author}` : ""}</p>
      <p className="mt-5 text-[17px] leading-8 text-[#4A4A4A]">{post.excerpt}</p>
      {headings.length >= 3 && <nav aria-labelledby="toc-heading" className="mt-6 rounded-2xl bg-[#F7F6F3] p-5">
        <p id="toc-heading" className="text-[15px] font-bold">In this guide</p>
        <ol className="mt-2 grid gap-1.5 text-[15px]">{headings.map((h, n) => <li key={h.id} className="flex gap-2"><span className="w-5 shrink-0 text-[#8A8A8A]">{n + 1}.</span><a href={`#${h.id}`} className="text-[#C96100] hover:underline">{h.text}</a></li>)}</ol>
      </nav>}

      {blocks.map((block, i) => {
        switch (block.type) {
          case "heading": return <h2 key={i} id={headingIds.get(i)} className="mt-9 scroll-mt-24 text-[22px] font-bold tracking-[-.01em]">{block.text}</h2>;
          case "paragraph": return <p key={i} className="mt-3 whitespace-pre-line text-[16px] leading-8 text-[#333]"><RichText text={block.text} /></p>;
          case "list": return <ul key={i} className="mt-3 grid gap-2">{block.items.map((item) => <li key={item} className="flex gap-2 text-[16px] leading-7"><Check size={18} className="mt-1 shrink-0 text-[#FF8A05]" aria-hidden="true" /><span><RichText text={item} /></span></li>)}</ul>;
          case "tip": return <p key={i} className="mt-4 flex gap-3 rounded-2xl bg-[#EEF9F2] p-4 text-[15px] leading-6 text-[#17563A]"><Lightbulb size={19} className="mt-0.5 shrink-0" aria-hidden="true" /><span><RichText text={block.text} /></span></p>;
          case "image": return block.src ? <figure key={i} className="mt-6"><img src={block.src} alt={block.alt} loading="lazy" className="w-full rounded-2xl object-cover" />{block.caption && <figcaption className="mt-2 text-center text-[13px] text-[#8A8A8A]">{block.caption}</figcaption>}</figure> : null;
          case "faq": return <section key={i} className="mt-8" aria-label="Frequently asked questions">
            <div className="divide-y divide-[#E6E4DE] rounded-2xl border border-[#E6E4DE]">
              {block.items.map((f) => <details key={f.q} className="group px-4 py-3.5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[16px] font-semibold [&::-webkit-details-marker]:hidden">{f.q}<ChevronDown size={18} className="shrink-0 transition group-open:rotate-180" aria-hidden="true" /></summary>
                <p className="mt-2 whitespace-pre-line text-[15px] leading-7 text-[#4A4A4A]"><RichText text={f.a} /></p>
              </details>)}
            </div>
          </section>;
          case "booking": return <BookingCard key={i} post={post} />;
        }
      })}
      <div className="mt-10 border-t border-[#E6E4DE] pt-6"><ShareButtons url={url} title={post.title} /></div>
    </article>
    <ArticleBar headings={headings.map(({ id, text }) => ({ id, text }))} bookHref={post.route ? routeHref(post.route, post.slug) : undefined} />

    {related.length > 0 && <section className="mx-auto max-w-[1180px] px-5 pb-16 lg:px-0" aria-labelledby="related-heading">
      <h2 id="related-heading" className="text-[24px] font-bold">You might also like</h2>
      <hr className="mt-3 border-t-[3px] border-[#1C1C1C]" />
      <ul className="mt-5 grid gap-6 md:grid-cols-3">
        {related.map((p) => <li key={p.slug}><Link href={`/blog/${p.slug}`} className="block"><BlogCover post={p} chips={false} /><p className="mt-3 text-[17px] font-semibold leading-snug">{p.title}</p><p className="mt-1 text-[14px] text-[#8A8A8A]">{formatBlogDate(p.date)}</p></Link></li>)}
      </ul>
    </section>}
    <div className="pb-20 lg:pb-0"><PublicFooter /></div>
  </main>;
}
