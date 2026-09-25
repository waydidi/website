"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { categoryLabel, type BlogPost } from "@/lib/blog-posts";
import { BlogCover, formatBlogDate } from "./blog-cover";

// "Latest articles": thumbnail rows with a "See more" button that reveals the rest.
// With `filters`, a search box and category chips narrow the list.
export function LatestList({ posts, initial = 5, filters = false }: { posts: BlogPost[]; initial?: number; filters?: boolean }) {
  const [shown, setShown] = useState(initial);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const categories = useMemo(() => [...new Set(posts.flatMap((p) => p.categories.map(categoryLabel)))], [posts]);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const list = posts.filter((p) =>
    (!category || p.categories.some((c) => categoryLabel(c) === category)) &&
    words.every((w) => `${p.title} ${p.excerpt} ${p.categories.map(categoryLabel).join(" ")}`.toLowerCase().includes(w)));
  const filtering = Boolean(words.length || category);
  const visible = filtering ? list : list.slice(0, shown);
  const chip = (active: boolean) => `h-9 shrink-0 rounded-full border px-4 text-[14px] font-medium ${active ? "border-[#1C1C1C] bg-[#1C1C1C] text-white" : "border-[#D6D3CC] text-[#1C1C1C] hover:bg-slate-50"}`;
  return <>
    {filters && <div className="mt-5">
      <label className="relative block">
        <span className="sr-only">Search guides</span>
        <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#8A8A8A]" aria-hidden="true" />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search guides, e.g. Pattaya, airport" className="h-12 w-full rounded-full border border-[#D6D3CC] bg-white pl-11 pr-11 text-[16px] outline-none focus:border-[#FF8A05]" />
        {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-3 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full hover:bg-slate-100"><X size={16} /></button>}
      </label>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filter by category">
        <button type="button" onClick={() => setCategory(null)} aria-pressed={!category} className={chip(!category)}>All</button>
        {categories.map((c) => <button key={c} type="button" onClick={() => setCategory(category === c ? null : c)} aria-pressed={category === c} className={chip(category === c)}>{c}</button>)}
      </div>
    </div>}
    {visible.length === 0 && <p className="mt-6 rounded-2xl bg-[#F7F6F3] p-5 text-[15px] text-[#4A4A4A]">No guides match that yet. Try another word or category.</p>}
    <ul className="mt-5 grid gap-5">
      {visible.map((post) => <li key={post.slug}>
        <Link href={`/blog/${post.slug}`} className="grid grid-cols-[42%_minmax(0,1fr)] items-start gap-4 sm:grid-cols-[220px_minmax(0,1fr)]">
          <BlogCover post={post} size="thumb" />
          <span className="min-w-0">
            <span className="line-clamp-2 text-[16px] font-semibold leading-snug text-[#1C1C1C]">{post.title}</span>
            <span className="mt-1.5 flex flex-wrap gap-x-3 text-[14px] italic text-[#E07400]">{post.categories.map((c) => <span key={c}>{categoryLabel(c)}</span>)}</span>
            <span className="mt-1.5 block text-[14px] text-[#8A8A8A]">{formatBlogDate(post.date)}</span>
          </span>
        </Link>
      </li>)}
    </ul>
    {!filtering && shown < list.length && <button type="button" onClick={() => setShown(list.length)} className="mt-6 h-12 w-full rounded-xl border-2 border-[#1C1C1C] text-[16px] font-semibold text-[#1C1C1C] hover:bg-slate-50">See more</button>}
  </>;
}
