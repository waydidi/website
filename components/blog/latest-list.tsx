"use client";

import Link from "next/link";
import { useState } from "react";
import { BLOG_CATEGORIES, type BlogPost } from "@/lib/blog-posts";
import { BlogCover, formatBlogDate } from "./blog-cover";

// "Latest articles": thumbnail rows with a "See more" button that reveals the rest.
export function LatestList({ posts, initial = 5 }: { posts: BlogPost[]; initial?: number }) {
  const [shown, setShown] = useState(initial);
  return <>
    <ul className="mt-5 grid gap-5">
      {posts.slice(0, shown).map((post) => <li key={post.slug}>
        <Link href={`/blog/${post.slug}`} className="grid grid-cols-[42%_minmax(0,1fr)] items-start gap-4 sm:grid-cols-[220px_minmax(0,1fr)]">
          <BlogCover post={post} size="thumb" />
          <span className="min-w-0">
            <span className="line-clamp-2 text-[16px] font-semibold leading-snug text-[#1C1C1C]">{post.title}</span>
            <span className="mt-1.5 flex flex-wrap gap-x-3 text-[14px] italic text-[#E07400]">{post.categories.map((c) => <span key={c}>{BLOG_CATEGORIES[c]}</span>)}</span>
            <span className="mt-1.5 block text-[14px] text-[#8A8A8A]">{formatBlogDate(post.date)}</span>
          </span>
        </Link>
      </li>)}
    </ul>
    {shown < posts.length && <button type="button" onClick={() => setShown(posts.length)} className="mt-6 h-12 w-full rounded-xl border-2 border-[#1C1C1C] text-[16px] font-semibold text-[#1C1C1C] hover:bg-slate-50">See more</button>}
  </>;
}
