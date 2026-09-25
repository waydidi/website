"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Bold, ChevronDown, Link2, Heading2, ImagePlus, Lightbulb, List, Pilcrow, Plus, Ticket, Trash2, Upload, X } from "lucide-react";
import { BlogCover } from "@/components/blog/blog-cover";
import { categoryLabel, COVER_TONES, type BlogBlock, type BlogPost, type CoverTone } from "@/lib/blog-posts";
import type { EditorPost } from "./editor-types";
export type { EditorPost } from "./editor-types";

// Textarea with Bold / Link buttons that wrap the selected text in **…** or [text](url).
function MarkupTextarea({ value, onChange, className, ...rest }: { value: string; onChange: (v: string) => void; className: string; rows: number; placeholder: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const wrap = (kind: "bold" | "link") => {
    const el = ref.current;
    if (!el) return;
    const [a, b] = [el.selectionStart, el.selectionEnd];
    const picked = value.slice(a, b) || (kind === "bold" ? "bold text" : "link text");
    let insert = `**${picked}**`;
    if (kind === "link") {
      const url = window.prompt("Link to (a page like /blog/… or a full https:// address)", "/");
      if (!url) return;
      insert = `[${picked}](${url.trim()})`;
    }
    onChange(value.slice(0, a) + insert + value.slice(b));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a, a + insert.length); });
  };
  const tool = "grid size-7 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900";
  return <div>
    <div className="mb-1 flex gap-0.5">
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => wrap("bold")} aria-label="Bold" title="Bold" className={tool}><Bold size={15} /></button>
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => wrap("link")} aria-label="Insert link" title="Link" className={tool}><Link2 size={15} /></button>
    </div>
    <textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} className={className} {...rest} />
  </div>;
}

const BLOCK_TYPES: { type: BlogBlock["type"]; label: string; icon: typeof Pilcrow; hint: string }[] = [
  { type: "paragraph", label: "Paragraph", icon: Pilcrow, hint: "Plain text" },
  { type: "heading", label: "Heading", icon: Heading2, hint: "Section title" },
  { type: "list", label: "List", icon: List, hint: "Checklist with ticks" },
  { type: "tip", label: "Tip box", icon: Lightbulb, hint: "Green highlighted tip" },
  { type: "image", label: "Image", icon: ImagePlus, hint: "Upload a photo" },
  { type: "booking", label: "Booking card", icon: Ticket, hint: "“See prices” for the post's route" },
];
const newBlock = (type: BlogBlock["type"]): BlogBlock => type === "list" ? { type, items: [""] } : type === "image" ? { type, src: "", alt: "" } : type === "booking" ? { type } : { type, text: "" };

const slugify = (v: string) => v.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90);
const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 16) : "");
const fromLocal = (v: string) => (v ? new Date(`${v}:00+07:00`).toISOString() : null);
const TONE_SWATCH: Record<CoverTone, string> = { orange: "bg-[#FF8A05]", navy: "bg-[#1E3A8A]", green: "bg-[#0E9F6E]", plum: "bg-[#7C3AED]" };

async function uploadImage(file: File) {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/admin/blog/images", { method: "POST", body: form });
  const data = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!response.ok || !data.url) throw new Error(data.error ?? "Upload failed.");
  return data.url;
}

function Panel({ title, children, open: initial = true }: { title: string; children: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(initial);
  return <section className="border-b border-slate-200 last:border-b-0">
    <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between px-5 py-4 text-left text-[15px] font-bold">{title}<ChevronDown size={18} className={`transition ${open ? "rotate-180" : ""}`} /></button>
    {open && <div className="px-5 pb-5">{children}</div>}
  </section>;
}

export function PostEditor({ initial, knownCategories }: { initial: EditorPost; knownCategories: string[] }) {
  const router = useRouter();
  const [post, setPost] = useState<EditorPost>(initial);
  const [slugTouched, setSlugTouched] = useState(Boolean(initial.slug));
  const [editingSlug, setEditingSlug] = useState(false);
  const [adding, setAdding] = useState<number | null>(null);
  const [newCategory, setNewCategory] = useState("");
  const [categories, setCategories] = useState(() => Array.from(new Set([...knownCategories, ...initial.categories])));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [schedule, setSchedule] = useState(Boolean(initial.publishedAt && initial.publishedAt > new Date().toISOString()));
  const featuredInput = useRef<HTMLInputElement>(null);

  const set = <K extends keyof EditorPost>(key: K, value: EditorPost[K]) => setPost((p) => ({ ...p, [key]: value }));
  const slug = slugTouched ? post.slug : slugify(post.title);
  const setBlock = (i: number, block: BlogBlock) => setPost((p) => ({ ...p, blocks: p.blocks.map((b, j) => (j === i ? block : b)) }));
  const moveBlock = (i: number, d: -1 | 1) => setPost((p) => { const blocks = [...p.blocks]; const j = i + d; if (j < 0 || j >= blocks.length) return p; [blocks[i], blocks[j]] = [blocks[j], blocks[i]]; return { ...p, blocks }; });
  const removeBlock = (i: number) => setPost((p) => ({ ...p, blocks: p.blocks.filter((_, j) => j !== i) }));
  const insertBlock = (at: number, type: BlogBlock["type"]) => { setPost((p) => { const blocks = [...p.blocks]; blocks.splice(at, 0, newBlock(type)); return { ...p, blocks }; }); setAdding(null); };

  async function save(status: EditorPost["status"], openPreview = false) {
    setBusy(true); setMessage(null);
    const body = { ...post, slug, status, publishedAt: status === "published" ? (schedule ? post.publishedAt : post.publishedAt && post.publishedAt <= new Date().toISOString() ? post.publishedAt : null) : post.publishedAt,
      blocks: post.blocks.filter((b) => b.type === "booking" || (b.type === "list" ? b.items.some((x) => x.trim()) : b.type === "image" ? b.src : b.text.trim())).map((b) => (b.type === "list" ? { ...b, items: b.items.filter((x) => x.trim()) } : b)),
      route: post.route && post.route.pickup.trim() ? post.route : null };
    const response = await fetch("/api/admin/blog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", post: body }) });
    const data = (await response.json().catch(() => ({}))) as { id?: string; slug?: string; error?: string };
    setBusy(false);
    if (!response.ok || !data.id) { setMessage({ tone: "error", text: data.error ?? "Couldn't save the post." }); return; }
    setPost((p) => ({ ...p, id: data.id, slug: data.slug!, status }));
    setSlugTouched(true);
    setMessage({ tone: "ok", text: status === "published" ? (schedule ? "Scheduled." : "Published.") : "Draft saved." });
    if (!post.id) router.replace(`/admin/blog/${data.id}`);
    if (openPreview) window.open(`/blog/${data.slug}?preview=1`, "_blank");
    router.refresh();
  }

  const input = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[15px] outline-none focus:border-[#FF8A05] focus:ring-2 focus:ring-orange-100";
  const published = post.status === "published";
  const previewPost: BlogPost = { slug, title: post.title || "Post title", excerpt: post.excerpt, date: "", categories: post.categories, cover: { headline: post.cover.headline || post.title || "Cover headline", tone: post.cover.tone, photo: post.featuredImage ?? undefined } };

  const addMenu = (at: number) => adding === at ? <div className="my-2 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-lg sm:grid-cols-3">
    {BLOCK_TYPES.map(({ type, label, icon: Icon, hint }) => <button key={type} type="button" onClick={() => insertBlock(at, type)} className="flex items-start gap-2 rounded-xl p-2.5 text-left hover:bg-orange-50"><Icon size={18} className="mt-0.5 shrink-0 text-[#C96100]" /><span><span className="block text-sm font-bold">{label}</span><span className="block text-xs text-slate-500">{hint}</span></span></button>)}
    <button type="button" onClick={() => setAdding(null)} className="col-span-full text-sm font-semibold text-slate-500">Cancel</button>
  </div> : <div className="group flex justify-center py-1"><button type="button" onClick={() => setAdding(at)} aria-label="Add block" className="grid size-8 place-items-center rounded-full border border-dashed border-slate-300 text-slate-400 opacity-60 transition hover:border-[#FF8A05] hover:text-[#FF8A05] group-hover:opacity-100"><Plus size={16} /></button></div>;

  return <div className="pb-24">
    {/* Top bar */}
    <div className="sticky top-[82px] z-20 -mx-4 mb-6 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-[#F6F7F9]/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8">
      <Link href="/admin/blog" className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-bold text-slate-600 hover:bg-white"><ArrowLeft size={16} />Posts</Link>
      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${published ? "bg-emerald-100 text-emerald-800" : post.status === "trash" ? "bg-red-100 text-red-700" : "bg-slate-200 text-slate-700"}`}>{published ? "Published" : post.status === "trash" ? "In trash" : "Draft"}</span>
      {message && <span role="status" className={`text-sm font-semibold ${message.tone === "ok" ? "text-emerald-700" : "text-red-700"}`}>{message.text}</span>}
      <div className="ml-auto flex flex-wrap gap-2">
        {!published && <button disabled={busy} onClick={() => save("draft")} className="rounded-full px-4 py-2 text-sm font-bold text-slate-700 hover:bg-white disabled:opacity-50">Save draft</button>}
        <button disabled={busy} onClick={() => save(published ? "published" : "draft", true)} className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-50">Preview</button>
        <button disabled={busy || !post.title.trim()} onClick={() => save("published")} className="rounded-full bg-[#FF8A05] px-5 py-2 text-sm font-bold text-white hover:bg-[#F07A00] disabled:opacity-50">{busy ? "Saving…" : published ? "Update" : schedule ? "Schedule" : "Publish"}</button>
      </div>
    </div>

    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      {/* Main column */}
      <div className="min-w-0 rounded-3xl bg-white p-5 shadow-sm sm:p-8">
        <label className="sr-only" htmlFor="post-title">Title</label>
        <textarea id="post-title" rows={Math.max(1, Math.ceil(post.title.length / 34))} value={post.title} onChange={(e) => set("title", e.target.value)} placeholder="Add title" className="w-full resize-none bg-transparent text-[30px] font-bold leading-tight outline-none placeholder:text-slate-300 sm:text-[36px]" />
        <p className="mt-2 flex flex-wrap items-center gap-1 text-sm text-slate-500">Permalink: <span className="text-slate-700">/blog/</span>
          {editingSlug ? <><input autoFocus value={post.slug || slug} onChange={(e) => { setSlugTouched(true); set("slug", slugify(e.target.value)); }} className="w-56 rounded-lg border border-slate-300 px-2 py-0.5 text-slate-800" /><button onClick={() => setEditingSlug(false)} className="rounded-full bg-slate-100 px-2.5 py-0.5 font-semibold">OK</button></>
            : <><span className="font-semibold text-slate-800">{slug || "your-post-title"}</span><button onClick={() => { setSlugTouched(true); set("slug", slug); setEditingSlug(true); }} className="rounded-full border border-slate-300 px-2.5 py-0.5 font-semibold text-slate-600">Edit</button></>}
        </p>

        <div className="mt-6">
          {addMenu(0)}
          {post.blocks.map((block, i) => <div key={i}>
            <div className="group relative rounded-2xl border border-transparent p-3 transition focus-within:border-orange-200 focus-within:bg-orange-50/30 hover:border-slate-200">
              <div className="mb-1.5 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-slate-400">
                {BLOCK_TYPES.find((t) => t.type === block.type)?.label}
                <span className="ml-auto flex gap-0.5 opacity-70 group-hover:opacity-100">
                  <button type="button" onClick={() => moveBlock(i, -1)} aria-label="Move up" className="grid size-7 place-items-center rounded-lg hover:bg-slate-100"><ArrowUp size={15} /></button>
                  <button type="button" onClick={() => moveBlock(i, 1)} aria-label="Move down" className="grid size-7 place-items-center rounded-lg hover:bg-slate-100"><ArrowDown size={15} /></button>
                  <button type="button" onClick={() => removeBlock(i)} aria-label="Remove block" className="grid size-7 place-items-center rounded-lg text-red-500 hover:bg-red-50"><Trash2 size={15} /></button>
                </span>
              </div>
              {block.type === "paragraph" && <MarkupTextarea rows={3} value={block.text} onChange={(text) => setBlock(i, { ...block, text })} placeholder="Start writing…" className="w-full resize-y bg-transparent text-[16px] leading-7 outline-none placeholder:text-slate-300" />}
              {block.type === "heading" && <input value={block.text} onChange={(e) => setBlock(i, { ...block, text: e.target.value })} placeholder="Heading" className="w-full bg-transparent text-[22px] font-bold outline-none placeholder:text-slate-300" />}
              {block.type === "tip" && <MarkupTextarea rows={2} value={block.text} onChange={(text) => setBlock(i, { ...block, text })} placeholder="A helpful tip for travellers" className="w-full resize-y rounded-xl bg-[#EEF9F2] p-3 text-[15px] leading-6 text-[#17563A] outline-none placeholder:text-emerald-700/40" />}
              {block.type === "list" && <div className="grid gap-2">
                {block.items.map((item, j) => <div key={j} className="flex items-center gap-2"><span className="text-[#FF8A05]">✓</span><input value={item} onChange={(e) => setBlock(i, { ...block, items: block.items.map((x, k) => (k === j ? e.target.value : x)) })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setBlock(i, { ...block, items: [...block.items.slice(0, j + 1), "", ...block.items.slice(j + 1)] }); } }} placeholder="List item" className="w-full border-b border-slate-100 bg-transparent py-1 text-[16px] outline-none" /><button type="button" onClick={() => setBlock(i, { ...block, items: block.items.filter((_, k) => k !== j) })} aria-label="Remove item" className="text-slate-300 hover:text-red-500"><X size={15} /></button></div>)}
                <button type="button" onClick={() => setBlock(i, { ...block, items: [...block.items, ""] })} className="w-fit text-sm font-semibold text-[#C96100]">+ Add item</button>
              </div>}
              {block.type === "image" && <ImageBlock block={block} onChange={(b) => setBlock(i, b)} />}
              {block.type === "booking" && <div className="rounded-xl border border-[#FFD8AE] bg-[#FFF6EB] p-4 text-sm text-[#8A4B00]">{post.route?.pickup ? <>Booking card for <strong>{post.route.label || `${post.route.pickup} → ${post.route.dropoff}`}</strong> with a “See prices” button.</> : <>Set the route in <strong>Booking card</strong> on the right to show this card.</>}</div>}
            </div>
            {addMenu(i + 1)}
          </div>)}
        </div>
      </div>

      {/* Sidebar */}
      <aside className="h-fit overflow-hidden rounded-3xl bg-white shadow-sm lg:sticky lg:top-[150px]">
        <Panel title="Publish">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={schedule} onChange={(e) => { setSchedule(e.target.checked); if (!e.target.checked) set("publishedAt", null); }} className="size-4 accent-[#FF8A05]" />Schedule for later</label>
          {schedule ? <input type="datetime-local" value={toLocal(post.publishedAt)} onChange={(e) => set("publishedAt", fromLocal(e.target.value))} className={`${input} mt-2`} /> : <p className="mt-2 text-sm text-slate-500">{published && post.publishedAt ? `Published ${new Date(post.publishedAt).toLocaleString("en-GB", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" })}` : "Publishes immediately."}</p>}
          <label className="mt-3 block text-sm font-semibold">Author<input value={post.author} onChange={(e) => set("author", e.target.value)} className={`${input} mt-1`} /></label>
          {published && <button disabled={busy} onClick={() => save("draft")} className="mt-3 text-sm font-semibold text-slate-600 underline">Switch to draft</button>}
        </Panel>
        <Panel title="Categories">
          <div className="grid gap-2">{categories.map((c) => <label key={c} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={post.categories.includes(c)} onChange={(e) => set("categories", e.target.checked ? [...post.categories, c] : post.categories.filter((x) => x !== c))} className="size-4 accent-[#FF8A05]" />{categoryLabel(c)}</label>)}</div>
          <div className="mt-3 flex gap-2"><input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="New category" className={input} /><button type="button" onClick={() => { const c = newCategory.trim(); if (!c) return; setCategories((all) => all.includes(c) ? all : [...all, c]); set("categories", post.categories.includes(c) ? post.categories : [...post.categories, c]); setNewCategory(""); }} className="shrink-0 rounded-xl bg-slate-100 px-3 text-sm font-bold">Add</button></div>
        </Panel>
        <Panel title="Featured image">
          {post.featuredImage ? <div><img src={post.featuredImage} alt="" className="aspect-video w-full rounded-xl object-cover" /><div className="mt-2 flex gap-3 text-sm font-semibold"><button onClick={() => featuredInput.current?.click()} className="text-[#C96100]">Replace</button><button onClick={() => set("featuredImage", null)} className="text-red-600">Remove</button></div></div>
            : <button type="button" onClick={() => featuredInput.current?.click()} className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 text-sm font-semibold text-slate-500 hover:border-[#FF8A05] hover:text-[#C96100]"><Upload size={20} />Set featured image</button>}
          <input ref={featuredInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; try { set("featuredImage", await uploadImage(file)); } catch (err) { setMessage({ tone: "error", text: (err as Error).message }); } }} />
          <p className="mt-2 text-xs text-slate-500">Shown on the right half of the cover. JPG, PNG or WebP, up to 5 MB.</p>
        </Panel>
        <Panel title="Cover design">
          <BlogCover post={previewPost} size="medium" />
          <label className="mt-3 block text-sm font-semibold">Cover headline<textarea rows={2} value={post.cover.headline} onChange={(e) => set("cover", { ...post.cover, headline: e.target.value })} placeholder="Short and bold, e.g. BKK → Pattaya the easy way" className={`${input} mt-1 resize-none`} /></label>
          <p className="mt-3 text-sm font-semibold">Colour</p>
          <div className="mt-1 flex gap-2">{COVER_TONES.map((tone) => <button key={tone} type="button" onClick={() => set("cover", { ...post.cover, tone })} aria-label={tone} aria-pressed={post.cover.tone === tone} className={`size-9 rounded-full ${TONE_SWATCH[tone]} ${post.cover.tone === tone ? "ring-2 ring-offset-2 ring-[#1C1C1C]" : ""}`} />)}</div>
        </Panel>
        <Panel title="Excerpt" open={false}>
          <textarea rows={3} value={post.excerpt} onChange={(e) => set("excerpt", e.target.value)} maxLength={400} placeholder="One or two sentences shown in lists and search results" className={`${input} resize-none`} />
          <p className="mt-1 text-right text-xs text-slate-400">{post.excerpt.length}/400</p>
        </Panel>
        <Panel title="Booking card" open={false}>
          <p className="text-xs text-slate-500">Adds a “See prices” card that opens the search form with this route filled in.</p>
          <div className="mt-2 grid gap-2">
            <select value={post.route?.service ?? "transfer"} onChange={(e) => set("route", { ...(post.route ?? { pickup: "", dropoff: "", label: "" }), service: e.target.value as "transfer" | "hourly" })} className={input}><option value="transfer">Private transfer</option><option value="hourly">Hourly private driver</option></select>
            <input value={post.route?.pickup ?? ""} onChange={(e) => set("route", { ...(post.route ?? { dropoff: "", label: "" }), pickup: e.target.value })} placeholder="Pickup, e.g. Suvarnabhumi Airport (BKK)" className={input} />
            {(post.route?.service ?? "transfer") === "transfer" && <input value={post.route?.dropoff ?? ""} onChange={(e) => set("route", { ...(post.route ?? { pickup: "", label: "" }), dropoff: e.target.value })} placeholder="Drop-off, e.g. Pattaya" className={input} />}
            <input value={post.route?.label ?? ""} onChange={(e) => set("route", { ...(post.route ?? { pickup: "", dropoff: "" }), label: e.target.value })} placeholder="Card title, e.g. Suvarnabhumi → Pattaya" className={input} />
            {post.route && <button type="button" onClick={() => set("route", null)} className="w-fit text-sm font-semibold text-red-600">Remove route</button>}
          </div>
        </Panel>
        <Panel title="Blog homepage" open={false}>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={post.featured} onChange={(e) => set("featured", e.target.checked)} className="size-4 accent-[#FF8A05]" />Show in “Featured articles”</label>
          <label className="mt-3 block text-sm font-semibold">Position in “Popular articles”<select value={post.popularRank ?? ""} onChange={(e) => set("popularRank", e.target.value ? Number(e.target.value) : null)} className={`${input} mt-1`}><option value="">Not listed</option>{Array.from({ length: 10 }, (_, i) => <option key={i} value={i + 1}>#{i + 1}</option>)}</select></label>
        </Panel>
        <Panel title="SEO" open={false}>
          <label className="block text-sm font-semibold">SEO title<input value={post.seoTitle} onChange={(e) => set("seoTitle", e.target.value)} maxLength={120} placeholder={post.title} className={`${input} mt-1`} /></label>
          <label className="mt-3 block text-sm font-semibold">Meta description<textarea rows={3} value={post.seoDescription} onChange={(e) => set("seoDescription", e.target.value)} maxLength={300} placeholder={post.excerpt} className={`${input} mt-1 resize-none`} /></label>
          <div className="mt-3 rounded-xl border border-slate-200 p-3"><p className="text-xs text-slate-500">Google preview</p><p className="mt-1 truncate text-[15px] text-[#1a0dab]">{post.seoTitle || post.title || "Post title"} | Waydidi</p><p className="text-xs text-emerald-700">waydidi.com/blog/{slug}</p><p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{post.seoDescription || post.excerpt || "Add an excerpt or meta description."}</p></div>
        </Panel>
      </aside>
    </div>
  </div>;
}

function ImageBlock({ block, onChange }: { block: Extract<BlogBlock, { type: "image" }>; onChange: (b: BlogBlock) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return <div>
    {block.src ? <img src={block.src} alt={block.alt} className="w-full rounded-xl object-cover" /> : <button type="button" disabled={busy} onClick={() => ref.current?.click()} className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 text-sm font-semibold text-slate-500 hover:border-[#FF8A05]"><Upload size={20} />{busy ? "Uploading…" : "Upload image"}</button>}
    <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; setBusy(true); setError(""); try { onChange({ ...block, src: await uploadImage(file) }); } catch (err) { setError((err as Error).message); } finally { setBusy(false); } }} />
    {error && <p className="mt-1 text-sm font-semibold text-red-600">{error}</p>}
    <div className="mt-2 grid gap-2 sm:grid-cols-2">
      <input value={block.alt} onChange={(e) => onChange({ ...block, alt: e.target.value })} placeholder="Alt text (describe the photo)" className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#FF8A05]" />
      <input value={block.caption ?? ""} onChange={(e) => onChange({ ...block, caption: e.target.value })} placeholder="Caption (optional)" className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#FF8A05]" />
    </div>
    {block.src && <button type="button" onClick={() => ref.current?.click()} className="mt-2 text-sm font-semibold text-[#C96100]">Replace image</button>}
  </div>;
}
