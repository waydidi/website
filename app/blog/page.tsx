import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PublicFooter } from "@/components/public-footer";
import { BlogCover, formatBlogDate } from "@/components/blog/blog-cover";
import { LatestList } from "@/components/blog/latest-list";
import { categoryLabel, categorySlug, POPULAR_PLACES } from "@/lib/blog-posts";
import { publishedPosts } from "@/lib/blog-store";
import { SITE_URL } from "@/lib/public-content";

export const metadata: Metadata = {
  title: "Travel guides for Thailand | Waydidi blog",
  description: "Getting there, airport tips, day trips and itineraries across Thailand, from the Waydidi private transfer team.",
  alternates: { canonical: `${SITE_URL}/blog` },
  openGraph: { title: "Waydidi travel guides", description: "Tips and inspiration for travelling around Thailand by private car.", url: `${SITE_URL}/blog`, type: "website" },
};

const heading = "text-[26px] font-bold tracking-[-.02em] text-[#1C1C1C]";

export const dynamic = "force-dynamic";

export default async function BlogHome() {
  const posts = await publishedPosts();
  const byDate = [...posts].sort((a, b) => b.date.localeCompare(a.date));
  const featured = byDate.filter((p) => p.featured);
  const popular = posts.filter((p) => p.popular).sort((a, b) => a.popular! - b.popular!);
  return <main className="font-home bg-white text-[#1C1C1C]">
    {/* Hero */}
    <section className="relative isolate overflow-hidden">
      <Image src="/destinations/phuket.webp" alt="" fill priority unoptimized sizes="100vw" className="-z-10 object-cover" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/45 via-black/25 to-black/50" />
      <div className="mx-auto max-w-[1180px] px-5 pb-16 pt-24 text-white sm:pt-32 lg:px-0">
        <h1 className="max-w-xl text-[34px] font-bold leading-[1.15] sm:text-[48px]">Explore Thailand with Waydidi!</h1>
        <p className="mt-4 max-w-xl text-[17px] leading-7 text-white/90">Travel tips and inspiration to make every trip across Thailand smoother, from the airport to the beach.</p>
        <Link href="/destinations" className="mt-7 inline-flex h-12 items-center gap-3 rounded-full border border-white/70 bg-white px-6 text-[17px] font-semibold text-[#E07400] shadow-sm">Choose a destination <ArrowRight size={20} aria-hidden="true" /></Link>
      </div>
    </section>

    <div className="mx-auto max-w-[1180px] px-5 lg:px-0">
      {/* Featured */}
      <section className="pt-12" aria-labelledby="featured-heading">
        <h2 id="featured-heading" className={heading}>Featured articles</h2>
        <hr className="mt-3 border-t-[3px] border-[#1C1C1C]" />
        <ul className="mt-6 grid gap-8 md:grid-cols-2">
          {featured.map((post) => <li key={post.slug}>
            <Link href={`/blog/${post.slug}`} className="block">
              <BlogCover post={post} />
              <p className="mt-4 text-[19px] font-semibold leading-snug">{post.title}</p>
              <p className="mt-2 text-[15px] text-[#8A8A8A]">{formatBlogDate(post.date)}</p>
            </Link>
          </li>)}
        </ul>
      </section>

      {/* Popular */}
      <section className="pt-14" aria-labelledby="popular-heading">
        <h2 id="popular-heading" className={heading}>Popular articles</h2>
        <hr className="mt-3 border-t-[3px] border-[#1C1C1C]" />
        <ol className="mt-6 grid gap-7">
          {popular.map((post, i) => <li key={post.slug}>
            <Link href={`/blog/${post.slug}`} className="flex gap-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#DDE3EE] text-[20px] font-bold italic text-white">{i + 1}</span>
              <span className="min-w-0">
                <span className="block text-[17px] font-semibold leading-snug">{post.title}</span>
                <span className="mt-1.5 line-clamp-2 block text-[15px] leading-6 text-[#8A8A8A]">{post.excerpt}</span>
              </span>
            </Link>
          </li>)}
        </ol>
      </section>

      {/* Latest */}
      <section className="pt-14" aria-labelledby="latest-heading">
        <h2 id="latest-heading" className={heading}>Latest articles</h2>
        <hr className="mt-3 border-t-[3px] border-[#1C1C1C]" />
        <LatestList posts={byDate} filters />
      </section>

      {/* Categories */}
      <section className="pt-14" aria-labelledby="topics-heading">
        <h2 id="topics-heading" className={heading}>Browse by topic</h2>
        <hr className="mt-3 border-t-[3px] border-[#1C1C1C]" />
        <ul className="mt-5 flex flex-wrap gap-3">
          {[...new Set(posts.flatMap((p) => p.categories.map(categoryLabel)))].map((label) => <li key={label}>
            <Link href={`/blog/category/${categorySlug(label)}`} className="inline-flex h-11 items-center gap-2 rounded-full border border-[#D6D3CC] px-5 text-[15px] font-semibold hover:border-[#FF8A05] hover:bg-[#FFF6EB]">{label}<span className="text-[#8A8A8A]">{posts.filter((p) => p.categories.some((c) => categoryLabel(c) === label)).length}</span></Link>
          </li>)}
        </ul>
      </section>

      {/* Explore more */}
      <section className="pb-16 pt-14" aria-labelledby="explore-heading">
        <h2 id="explore-heading" className="text-[24px] font-bold">Explore more on Waydidi</h2>
        <p className="mt-3 text-[18px] font-medium">Popular places in Thailand</p>
        <ol className="mt-4 flex flex-wrap gap-3">
          {POPULAR_PLACES.map((place, i) => <li key={place.href}>
            <Link href={place.href} className="flex overflow-hidden rounded-lg border border-[#8A5A1E] text-[15px] text-[#1C1C1C] hover:bg-[#FFF6EB]">
              <span className="border-r border-[#8A5A1E] bg-[#FFF6EB] px-3 py-1.5 text-[#8A5A1E]">{i + 1}</span>
              <span className="px-4 py-1.5">{place.label}</span>
            </Link>
          </li>)}
        </ol>
      </section>
    </div>
    <PublicFooter />
  </main>;
}
