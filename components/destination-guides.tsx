import Link from "next/link";
import type { BlogPost } from "@/lib/blog-posts";

// "{City} travel guide": horizontally scrolling photo cards that open the blog article.
export function DestinationGuides({ city, posts, fallbackImage }: { city: string; posts: BlogPost[]; fallbackImage?: string }) {
  if (!posts.length) return null;
  return <section aria-labelledby="city-guides-h" className="mx-auto max-w-[1180px] pb-16">
    <h2 id="city-guides-h" className="px-5 text-3xl font-black tracking-[-.035em] sm:text-4xl">{city} travel guide</h2>
    <ul className="mt-6 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] sm:gap-4">
      {posts.map((post) => {
        const photo = post.cover.photo ?? fallbackImage;
        return <li key={post.slug} className="w-[72%] shrink-0 snap-start sm:w-[300px]">
          <Link href={`/blog/${post.slug}`} className="group relative block aspect-square overflow-hidden rounded-[22px] bg-gradient-to-br from-brand to-[#FF5C1F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {photo && <img src={photo} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105" />}
            <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" aria-hidden="true" />
            <span className="absolute inset-x-0 bottom-0 p-5 text-[22px] font-bold leading-[1.15] tracking-[-.01em] text-white drop-shadow-sm sm:text-[24px]">{post.title}</span>
          </Link>
        </li>;
      })}
    </ul>
  </section>;
}
