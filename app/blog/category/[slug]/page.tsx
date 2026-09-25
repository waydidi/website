import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { PublicFooter } from "@/components/public-footer";
import { LatestList } from "@/components/blog/latest-list";
import { categoryLabel, categorySlug, type BlogPost } from "@/lib/blog-posts";
import { publishedPosts } from "@/lib/blog-store";
import { SITE_URL } from "@/lib/public-content";

export const dynamic = "force-dynamic";

async function load(slug: string): Promise<{ label: string; posts: BlogPost[] } | null> {
  const all = (await publishedPosts()).sort((a, b) => b.date.localeCompare(a.date));
  const posts = all.filter((p) => p.categories.some((c) => categorySlug(c) === slug));
  if (!posts.length) return null;
  return { label: categoryLabel(posts[0].categories.find((c) => categorySlug(c) === slug)!), posts };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const slug = (await params).slug;
  const data = await load(slug);
  if (!data) return { title: "Topic not found | Waydidi" };
  const url = `${SITE_URL}/blog/category/${slug}`;
  return {
    title: `${data.label}: Thailand travel guides | Waydidi`,
    description: `${data.posts.length} Waydidi guide${data.posts.length === 1 ? "" : "s"} on ${data.label.toLowerCase()} in Thailand, with practical tips for travelling by private car.`,
    alternates: { canonical: url },
    openGraph: { title: `${data.label} | Waydidi travel guides`, url, type: "website" },
  };
}

export default async function BlogCategory({ params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  const data = await load(slug);
  if (!data) notFound();
  const jsonLd = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Travel guides", item: `${SITE_URL}/blog` },
    { "@type": "ListItem", position: 3, name: data.label, item: `${SITE_URL}/blog/category/${slug}` },
  ] };
  return <main className="font-home bg-white text-[#1C1C1C]">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    <div className="mx-auto max-w-[1180px] px-5 pb-16 pt-6 lg:px-0">
      <nav aria-label="Breadcrumb"><ol className="flex items-center gap-1 text-[14px] text-[#6B6B6B]">
        <li><Link href="/" className="hover:text-[#1C1C1C]">Home</Link></li>
        <li aria-hidden="true"><ChevronRight size={14} /></li>
        <li><Link href="/blog" className="hover:text-[#1C1C1C]">Travel guides</Link></li>
      </ol></nav>
      <h1 className="mt-4 text-[32px] font-bold tracking-[-.02em]">{data.label}</h1>
      <p className="mt-2 text-[16px] text-[#6B6B6B]">{data.posts.length} guide{data.posts.length === 1 ? "" : "s"}</p>
      <hr className="mt-4 border-t-[3px] border-[#1C1C1C]" />
      <LatestList posts={data.posts} initial={20} />
    </div>
    <PublicFooter />
  </main>;
}
