"use client";

import { useEffect, useState } from "react";

// Waymo-style reveal: the headline appears with a blue caret (line + dot)
// at its end; about 1 second later the caret fades away.
export function TypedHeadline({ text, className }: { text: string; className?: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDone(false);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setDone(true); return; }
    const timer = window.setTimeout(() => setDone(true), 1000);
    return () => window.clearTimeout(timer);
  }, [text]);

  return <h1 className={className}>
    {text}
    <span aria-hidden="true" className={`relative inline-block h-[1em] w-0 align-[-.12em] transition-opacity duration-500 ${done ? "opacity-0" : "opacity-100"}`}>
      <span className="absolute -top-[.08em] bottom-[-.08em] left-0 w-[2px] bg-[#5B8DEF]" />
      <span className="absolute -bottom-[.3em] -left-[.13em] size-[.3em] rounded-full bg-[#5B8DEF]" />
    </span>
  </h1>;
}
