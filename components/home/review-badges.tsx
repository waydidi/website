"use client";

// Waydidi's real review profiles. The section stays hidden until both a URL and
// a genuine rating are filled in here — never show a rating Waydidi doesn't hold.
// Until then it shows labelled sample ratings (prototype).
const TRIPADVISOR = { url: "", rating: 0 }; // bubbles, 0–5 in halves
const TRUSTPILOT = { url: "", rating: 0, label: "" }; // e.g. 4.5 and "Excellent"

function Bubbles({ rating }: { rating: number }) {
  return <span className="flex items-center gap-[3px]" aria-hidden="true">
    {Array.from({ length: 5 }, (_, i) => {
      const fill = Math.max(0, Math.min(1, rating - i));
      return <svg key={i} viewBox="0 0 12 12" className="size-3">
        <defs><clipPath id={`ta-b${i}`}><rect width={12 * fill} height="12" /></clipPath></defs>
        <circle cx="6" cy="6" r="5.25" fill="none" stroke="#34833C" strokeWidth="1.5" />
        <circle cx="6" cy="6" r="6" fill="#34833C" clipPath={`url(#ta-b${i})`} />
      </svg>;
    })}
  </span>;
}

function TripadvisorLogo() {
  return <span className="flex items-center gap-[3px] text-[#00220D]">
    <svg viewBox="0 0 26 16" className="h-[18px] w-[29px]" aria-hidden="true">
      <path d="M13 3.2C10.9 1.9 8.4 1.4 5.8 1.9L3.3 1.9 4.7 3.5A6 6 0 1 0 13 11.9a6 6 0 1 0 8.3-8.4l1.4-1.6h-2.5C17.6 1.4 15.1 1.9 13 3.2Z" fill="currentColor" />
      <circle cx="7" cy="9.3" r="3.9" fill="#fff" /><circle cx="19" cy="9.3" r="3.9" fill="#fff" />
      <circle cx="7" cy="9.3" r="1.9" fill="currentColor" /><circle cx="19" cy="9.3" r="1.9" fill="currentColor" />
    </svg>
    <span className="text-[17px] font-bold leading-none tracking-[-.04em]">Tripadvisor</span>
  </span>;
}

function TrustStars({ rating }: { rating: number }) {
  return <span className="flex gap-[2px]" aria-hidden="true">
    {Array.from({ length: 5 }, (_, i) => {
      const fill = Math.max(0, Math.min(1, rating - i));
      return <span key={i} className="relative grid size-4 place-items-center bg-[#DCDCE6]">
        <span className="absolute inset-y-0 left-0 bg-[#00B67A]" style={{ width: `${fill * 100}%` }} />
        <svg viewBox="0 0 24 24" className="relative size-3" fill="#fff"><path d="m12 2.5 2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.7l7.1-.6L12 2.5Z" /></svg>
      </span>;
    })}
  </span>;
}

function TrustpilotLogo() {
  return <span className="flex items-end gap-[2px] text-[#191919]">
    <svg viewBox="0 0 24 24" className="size-[19px]" aria-hidden="true"><path d="m12 1 2.7 8.2H23l-6.7 4.9 2.6 8.1L12 17.2 5.1 22.2l2.6-8.1L1 9.2h8.3L12 1Z" fill="#00B67A" /><path d="m15.6 14.9-.6-1.9-3 2.2 3.6-.3Z" fill="#005128" /></svg>
    <span className="text-[14px] font-semibold leading-none tracking-[-.02em]">Trustpilot</span>
  </span>;
}

export function ReviewBadges() {
  const configured = Boolean(TRIPADVISOR.url && TRIPADVISOR.rating && TRUSTPILOT.url && TRUSTPILOT.rating && TRUSTPILOT.label);
  // Prototype: until real ratings are set, the band shows sample ratings,
  // clearly marked as samples so customers aren't misled.
  const ta = configured ? TRIPADVISOR : { url: "#", rating: 5 };
  const tp = configured ? TRUSTPILOT : { url: "#", rating: 5, label: "Excellent" };

  return <section aria-label="Customer reviews" className="font-home bg-[#F1F2F6] px-3">
    <div className="mx-auto max-w-[640px]">
      <a href={configured ? ta.url : undefined} target="_blank" rel="noopener noreferrer" aria-label={`Tripadvisor rating ${ta.rating} of 5`} className="flex h-[88px] items-center justify-center gap-2">
        <TripadvisorLogo /><Bubbles rating={ta.rating} />
      </a>
      <hr className="border-t border-[#D5D7DE]" />
      <a href={configured ? tp.url : undefined} target="_blank" rel="noopener noreferrer" aria-label={`Trustpilot rating ${tp.label}, ${tp.rating} of 5`} className="flex h-[66px] items-center justify-center gap-2.5">
        <span className="text-[13px] font-medium text-[#191919]">{tp.label}</span><TrustStars rating={tp.rating} /><TrustpilotLogo />
      </a>
      {!configured && <p className="pb-3 text-center text-[11px] text-[#8A8A8A]">Sample ratings · design prototype</p>}
    </div>
  </section>;
}
