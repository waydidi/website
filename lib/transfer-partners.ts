export type PartnerType = "travel-agent" | "host-agency" | "hotel";

export const TRANSFER_PARTNERS = [
  {
    id: "travel-agent" as const,
    label: "Travel Agents",
    title: "Transform your clients’ transfers into unforgettable experiences",
    description: "Elevate your clients' travel experience with\nWaydidi's stress-free, private car transfers, whether they're heading to the airport, traveling within the city, or exploring the area.",
    benefits: [
      "24/7 support for you and your clients",
      "Competitive commission or net rate options",
      "Private transfers across Thailand; availability depends on your route",
      "Comfortable vehicles with English-speaking drivers",
    ],
    action: "Create an account",
    href: "/account/sign-in?next=%2Fagencies%2Fregister",
    learnMore: "/agencies#why-heading",
    gradient: "bg-[linear-gradient(110deg,#ADCEFA_0%,#DCEBFF_100%)]",
  },
  {
    id: "host-agency" as const,
    label: "Host Agencies & Consortia",
    title: "Expand your advisors' travel offerings with Waydidi",
    description: "Offer your advisors reliable private car transfers, from city-to-city rides to day trips and more. Competitive commissions or net rates, 24/7 customer and agent support, as well as professional, English-speaking drivers are standard for each trip.",
    benefits: [
      "Competitive commissions or net rates",
      "Professional, English-speaking drivers",
      "Private transfers across Thailand; availability depends on your route",
    ],
    action: "Become a partner",
    href: "/agencies?partner=host-agency#apply",
    learnMore: "/agencies?partner=host-agency#why-heading",
    gradient: "bg-[linear-gradient(110deg,#B0EEAD_0%,#E3F9E4_100%)]",
  },
] as const;

// Store the selected partner category in the existing application note without
// changing the database contract. Legacy notes remain readable as travel-agent.
export function partnerApplicationMessage(type: PartnerType, message?: string) {
  return `[Waydidi partner type: ${type}]\n${message?.trim() ?? ""}`;
}
export function readPartnerApplication(message: string | null) {
  const match = message?.match(/^\[Waydidi partner type: (travel-agent|host-agency|hotel)\]\n/);
  return { type: (match?.[1] ?? "travel-agent") as PartnerType, message: match ? message!.slice(match[0].length).trim() : message ?? "" };
}
export const partnerTypeName = (type: PartnerType) => type === "hotel" ? "Hotel / concierge" : type === "host-agency" ? "Host agency / consortium" : "Travel agent";
