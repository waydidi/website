"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ExternalLink, FileText, Pencil, Plus, RotateCcw, Search, Star, Trash2 } from "lucide-react";
import type { adminPosts } from "@/lib/blog-store";
import { categoryLabel } from "@/lib/blog-posts";

type Post = Awaited<ReturnType<typeof adminPosts>>[number];
type Tab = "all" | "published" | "draft" | "trash";
const TABS: [Tab, string][] = [["all", "All"], ["published", "Published"], ["draft", "Drafts"], ["trash", "Trash"]];

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

export function BlogPostsAdmin({ posts }: { posts: Post[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const counts = useMemo(() => ({ all: posts.filter((p) => p.status !== "trash").length, published: posts.filter((p) => p.status === "published").length, draft: posts.filter((p) => p.status === "draft").length, trash: posts.filter((p) => p.status === "trash").length }), [posts]);
  const shown = posts.filter((p) => (tab === "all" ? p.status !== "trash" : p.status === tab) && (!query.trim() || p.title.toLowerCase().includes(query.trim().toLowerCase())));

  async function call(body: unknown) {
    setBusy(true); setError("");
    const response = await fetch("/api/admin/blog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!response.ok) { setError(data.error ?? "Something went wrong."); return; }
    router.refresh();
  }

  // Trash / restore re-save the post with a new status.
  const setStatus = (p: Post, status: "draft" | "trash") => call({ action: "save", post: { id: p.id, title: p.title, slug: p.slug, excerpt: p.excerpt, status, publishedAt: p.publishedAt, categories: p.categories, featured: p.featured, popularRank: p.popular ?? null, featuredImage: p.cover.photo ?? null, cover: { headline: p.cover.headline, tone: p.cover.tone }, route: p.route ?? null, blocks: p.blocks ?? [], seoTitle: p.seoTitle ?? null, seoDescription: p.seoDescription ?? null, author: p.author } });

  return <div>
    <div className="flex flex-wrap items-center gap-3">
      <h1 className="text-3xl font-black">Posts</h1>
      <Link href="/admin/blog/new" className="inline-flex items-center gap-1.5 rounded-full bg-[#FF8A05] px-4 py-2 text-sm font-bold text-white hover:bg-[#F07A00]"><Plus size={16} />Add New Post</Link>
      <Link href="/blog" target="_blank" className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900">View blog <ExternalLink size={14} /></Link>
    </div>
    <p className="mt-1 text-slate-600">Write travel guides for the Waydidi blog. Published posts appear on /blog straight away.</p>

    {posts.length === 0 && <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
      <p className="font-bold">The blog is showing the 8 built-in starter guides</p>
      <p className="mt-1 text-sm">Import them to edit them here. Once you save your first post, only posts in this list appear on the blog — so import first if you want to keep them.</p>
      <button disabled={busy} onClick={() => call({ action: "import" })} className="mt-3 rounded-full bg-white px-4 py-2 text-sm font-bold text-amber-900 shadow-sm disabled:opacity-50">Import starter guides</button>
    </div>}

    <div className="mt-6 flex flex-wrap items-center gap-3">
      <div className="flex flex-wrap gap-1 rounded-full bg-white p-1 shadow-sm">
        {TABS.map(([id, label]) => <button key={id} onClick={() => setTab(id)} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === id ? "bg-[#1C1C1C] text-white" : "text-slate-600 hover:bg-slate-100"}`}>{label} <span className={tab === id ? "text-white/70" : "text-slate-400"}>({counts[id]})</span></button>)}
      </div>
      <label className="ml-auto flex h-10 w-full items-center gap-2 rounded-full bg-white px-4 shadow-sm sm:w-72"><Search size={16} className="text-slate-400" /><span className="sr-only">Search posts</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search posts" className="w-full bg-transparent text-sm outline-none" /></label>
    </div>
    {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}

    <ul className="mt-4 grid gap-3">
      {shown.length === 0 && <li className="rounded-2xl bg-white p-10 text-center text-slate-500"><FileText className="mx-auto" /><p className="mt-2 font-semibold">No posts here yet</p></li>}
      {shown.map((p) => <li key={p.id} className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/admin/blog/${p.id}`} className="text-[17px] font-bold hover:text-[#C96100]">{p.title}</Link>
            {p.status === "draft" && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-700">Draft</span>}
            {p.status === "published" && p.publishedAt && p.publishedAt > new Date().toISOString() && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-800">Scheduled</span>}
            {p.featured && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800"><Star size={11} />Featured</span>}
            {p.popular && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-800">Popular #{p.popular}</span>}
          </div>
          <p className="mt-1 truncate text-sm text-slate-500">{p.categories.map(categoryLabel).join(", ") || "Uncategorised"} · /blog/{p.slug}</p>
        </div>
        <p className="shrink-0 text-sm text-slate-500">{p.status === "published" ? `Published ${when(p.publishedAt)}` : `Last modified ${when(p.updatedAt)}`}</p>
        <div className="flex shrink-0 gap-1">
          {p.status === "trash" ? <>
            <button disabled={busy} onClick={() => setStatus(p, "draft")} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold text-slate-700 hover:bg-slate-100"><RotateCcw size={15} />Restore</button>
            <button disabled={busy} onClick={() => { if (confirm(`Delete "${p.title}" permanently?`)) void call({ action: "delete", id: p.id }); }} className="rounded-full px-3 py-1.5 text-sm font-bold text-red-600 hover:bg-red-50">Delete permanently</button>
          </> : <>
            <Link href={`/admin/blog/${p.id}`} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold text-[#C96100] hover:bg-orange-50"><Pencil size={15} />Edit</Link>
            <Link href={`/blog/${p.slug}${p.status === "published" ? "" : "?preview=1"}`} target="_blank" className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold text-slate-700 hover:bg-slate-100"><ExternalLink size={15} />{p.status === "published" ? "View" : "Preview"}</Link>
            <button disabled={busy} onClick={() => setStatus(p, "trash")} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold text-red-600 hover:bg-red-50"><Trash2 size={15} />Trash</button>
          </>}
        </div>
      </li>)}
    </ul>
  </div>;
}
