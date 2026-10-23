// Waydidi's social accounts, shown as icons under the itinerary (and anywhere else that lists them).
// An account with no link yet is left out.
export type SocialNetwork = "facebook" | "youtube" | "instagram" | "x" | "tiktok";
export const SOCIAL_LINKS: { network: SocialNetwork; label: string; href: string }[] = [
  { network: "facebook", label: "Facebook", href: "" },
  { network: "youtube", label: "YouTube", href: "" },
  { network: "instagram", label: "Instagram", href: "" },
  { network: "x", label: "X", href: "" },
  { network: "tiktok", label: "TikTok", href: "" },
];
