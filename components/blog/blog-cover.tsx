import Image from "next/image";
import { categoryLabel, type BlogPost } from "@/lib/blog-posts";

const TONES: Record<BlogPost["cover"]["tone"], string> = {
  orange: "from-[#FF8A05] to-[#FF5C1F]",
  navy: "from-[#1E3A8A] to-[#3B5BDB]",
  green: "from-[#0E9F6E] to-[#06C755]",
  plum: "from-[#7C3AED] to-[#C026D3]",
};

// Brand graphic cover in the Klook style: bold headline on colour, with an optional photo panel.
export function BlogCover({ post, size = "large", chips = true }: { post: BlogPost; size?: "large" | "medium" | "thumb"; chips?: boolean }) {
  const large = size !== "thumb";
  const medium = size === "medium";
  return <div className={`relative overflow-hidden bg-gradient-to-br ${TONES[post.cover.tone]} ${large ? "aspect-[16/8.6] rounded-[20px]" : "aspect-[4/3] rounded-[14px]"}`}>
    {post.cover.photo && <div className="absolute inset-y-0 right-0 w-[48%]">
      <Image src={post.cover.photo} alt="" fill unoptimized sizes="50vw" className="object-cover" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/25 to-transparent" />
    </div>}
    <span aria-hidden="true" className={`absolute rounded-full bg-white/15 ${large ? "-left-10 -top-10 size-40" : "-left-6 -top-6 size-20"}`} />
    <p className={`relative whitespace-pre-line font-extrabold leading-[1.02] tracking-[-.02em] text-white drop-shadow-sm ${medium ? "max-w-[58%] p-4 text-[20px]" : large ? "max-w-[58%] p-5 text-[clamp(20px,5.6vw,38px)]" : "max-w-[92%] p-2.5 text-[13px]"}`}>{post.cover.headline}</p>
    {large && chips && <div className="absolute bottom-3 left-3 flex flex-wrap gap-2">
      {post.categories.map((c) => <span key={c} className="rounded-full bg-white px-3 py-1 text-[13px] italic text-[#E07400] shadow-sm">{categoryLabel(c)}</span>)}
    </div>}
  </div>;
}

export const formatBlogDate = (iso: string) => new Date(`${iso}T00:00:00+07:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" });
