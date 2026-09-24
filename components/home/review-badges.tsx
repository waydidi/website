"use client";

// Waydidi's real review profiles. Fill in the page URLs to link the rows; add
// genuine ratings to show them — never a rating Waydidi doesn't hold.
const TRIPADVISOR = { url: "", rating: 0 }; // bubbles, 0–5 in halves

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

export function ReviewBadges() {
  // With real ratings filled in above, show them; otherwise invite reviews
  // with the logos only — never a rating Waydidi doesn't hold.
  const rated = Boolean(TRIPADVISOR.url && TRIPADVISOR.rating);
  const Row = ({ url, className, label, children }: { url: string; className: string; label: string; children: React.ReactNode }) =>
    url ? <a href={url} target="_blank" rel="noopener noreferrer" aria-label={label} className={className}>{children}</a>
      : <div aria-label={label} className={className}>{children}</div>;

  return <section aria-label="Customer reviews" className="font-home bg-[#F1F2F6] px-3">
    <div className="mx-auto max-w-[640px]">
      <Row url={TRIPADVISOR.url} label={rated ? `Tripadvisor rating ${TRIPADVISOR.rating} of 5` : "Review us on Tripadvisor"} className="flex h-[88px] items-center justify-center gap-2">
        {rated ? <><TripadvisorLogo /><Bubbles rating={TRIPADVISOR.rating} /></> : <><span className="text-[13px] font-medium text-[#191919]">Review us on</span><TripadvisorLogo /></>}
      </Row>
    </div>
  </section>;
}
