import type { BlogBlock } from "./blog-posts";

// Checks shown in the editor's "SEO checklist" panel. Pure so it can be tested.
export type SeoInput = {
  title: string; seoTitle: string; seoDescription: string; excerpt: string; slug: string; focusKeyword: string;
  blocks: BlogBlock[]; featuredImage: string | null; hasRoute: boolean;
};
export type SeoCheck = { id: string; label: string; status: "good" | "warn" | "bad"; hint: string };

const strip = (t: string) => t.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
const blockText = (b: BlogBlock) => b.type === "paragraph" || b.type === "tip" || b.type === "heading" ? b.text : b.type === "list" ? b.items.join(" ") : b.type === "faq" ? b.items.map((f) => `${f.q} ${f.a}`).join(" ") : "";
const rawText = (b: BlogBlock) => b.type === "paragraph" || b.type === "tip" ? b.text : b.type === "list" ? b.items.join(" ") : b.type === "faq" ? b.items.map((f) => f.a).join(" ") : "";

export function seoChecks(p: SeoInput): SeoCheck[] {
  const checks: SeoCheck[] = [];
  const add = (id: string, label: string, status: SeoCheck["status"], hint: string) => checks.push({ id, label, status, hint });
  const title = `${p.seoTitle || p.title} | Waydidi`;
  const description = p.seoDescription || p.excerpt;
  const words = strip(p.blocks.map(blockText).join(" ")).split(/\s+/).filter(Boolean).length;
  const keyword = p.focusKeyword.trim().toLowerCase();
  const firstParagraph = p.blocks.find((b) => b.type === "paragraph") as { text: string } | undefined;

  if (keyword) {
    const has = (text: string) => text.toLowerCase().includes(keyword);
    const slugKeyword = keyword.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
    add("kw-title", "Focus keyword in the title", has(p.seoTitle || p.title) ? "good" : "bad", "Put the words people search for in the title, near the start.");
    add("kw-description", "Focus keyword in the meta description", has(description) ? "good" : "warn", "Google bolds matching words in the snippet.");
    add("kw-intro", "Focus keyword in the first paragraph", firstParagraph && has(strip(firstParagraph.text)) ? "good" : "warn", "Mention it naturally in the opening lines.");
    add("kw-slug", "Focus keyword in the permalink", p.slug.includes(slugKeyword) ? "good" : "warn", `e.g. /blog/${slugKeyword}`);
  } else add("kw", "Focus keyword set", "warn", "Add the phrase you want this guide to rank for, e.g. “Bangkok to Hua Hin”.");

  add("title-length", "Title length", title.length >= 35 && title.length <= 65 ? "good" : title.length > 65 ? "warn" : "warn", `${title.length} characters with “| Waydidi”. Aim for 35–65 so Google doesn't cut it off.`);
  add("description-length", "Meta description length", description.length >= 110 && description.length <= 160 ? "good" : description.length ? "warn" : "bad", description.length ? `${description.length} characters. Aim for 110–160.` : "Write an excerpt or meta description.");
  add("words", "Length of the guide", words >= 600 ? "good" : words >= 300 ? "warn" : "bad", `${words} words. Guides that rank usually cover the topic in 600+ words.`);
  const headings = p.blocks.filter((b) => b.type === "heading").length;
  add("headings", "Sections with headings", headings >= 3 ? "good" : "warn", `${headings} heading${headings === 1 ? "" : "s"}. 3 or more give a contents list and easier reading.`);
  const internal = p.blocks.map(rawText).join(" ").match(/\]\(\/[^)]*\)/g)?.length ?? 0;
  add("internal-links", "Links to other Waydidi pages", internal >= 2 ? "good" : internal === 1 ? "warn" : "bad", `${internal} internal link${internal === 1 ? "" : "s"}. Link to 2+ related guides or destination pages.`);
  const images = p.blocks.filter((b): b is Extract<BlogBlock, { type: "image" }> => b.type === "image" && Boolean(b.src));
  const noAlt = images.filter((b) => !b.alt.trim()).length;
  add("alt", "Image descriptions (alt text)", noAlt ? "bad" : "good", noAlt ? `${noAlt} image${noAlt === 1 ? " has" : "s have"} no description.` : images.length ? "Every image is described." : "No images in the text yet.");
  add("featured-image", "Featured image", p.featuredImage ? "good" : "warn", "Shown when the guide is shared on LINE, Facebook or X.");
  const booking = p.blocks.some((b) => b.type === "booking");
  add("booking", "Booking card", booking && p.hasRoute ? "good" : "warn", booking ? "Set the route in “Booking card” so the button works." : "Add a Booking card so readers can check prices.");
  add("faq", "FAQ block", p.blocks.some((b) => b.type === "faq") ? "good" : "warn", "A few questions and answers can show directly in Google.");
  return checks;
}

export const seoScore = (checks: SeoCheck[]) => Math.round((checks.reduce((n, c) => n + (c.status === "good" ? 1 : c.status === "warn" ? 0.5 : 0), 0) / checks.length) * 100);
