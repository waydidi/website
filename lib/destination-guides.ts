import type { BlogPost } from "@/lib/blog-posts";

// Which blog guides belong on a destination page: posts that mention the city
// (or a well-known place in it) in the title, excerpt, cover or booking route.
const PLACES: Record<string, RegExp> = {
  bangkok: /bangkok|suvarnabhumi|don\s*mueang|sukhumvit|กรุงเทพ/i,
  phuket: /phuket|patong|kata|karon|ภูเก็ต/i,
  krabi: /krabi|ao\s*nang|railay|กระบี่/i,
  pattaya: /pattaya|jomtien|naklua|พัทยา/i,
  kanchanaburi: /kanchanaburi|river\s*kwai|erawan|กาญจนบุรี/i,
  "koh-chang": /ko(h)?\s*chang|เกาะช้าง/i,
  "koh-kood": /ko(h)?\s*k(oo|u)d|เกาะกูด/i,
  ayutthaya: /ayutthaya|อยุธยา/i,
  "hua-hin": /hua\s*hin|cha[\s-]*am|หัวหิน/i,
};

export function guidesForDestination(slug: string, name: string, posts: BlogPost[]) {
  const re = PLACES[slug] ?? new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const text = (p: BlogPost) => [p.title, p.excerpt, p.cover.headline, p.route?.pickup, p.route?.dropoff, p.route?.label].filter(Boolean).join(" ");
  // Posts with the city in the title first, then the rest.
  return posts.filter((p) => re.test(text(p))).sort((a, b) => Number(re.test(b.title)) - Number(re.test(a.title))).slice(0, 8);
}
