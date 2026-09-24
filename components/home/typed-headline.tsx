"use client";

import { useEffect, useState } from "react";

// Waymo-style reveal: the headline types in on a dark highlight with a blue
// caret (line + dot) at its end, then the highlight and caret fade away.
export function TypedHeadline({ text, className }: { text: string; className?: string }) {
  const [count, setCount] = useState(0);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCount(text.length); setDone(true); return;
    }
    setCount(0); setDone(false);
    let i = 0;
    const timer = window.setInterval(() => {
      i += 1; setCount(i);
      if (i >= text.length) { window.clearInterval(timer); window.setTimeout(() => setDone(true), 1400); }
    }, 55);
    return () => window.clearInterval(timer);
  }, [text]);

  return <h1 className={`relative ${className ?? ""}`} aria-label={text}>
    {/* Full text keeps the layout from jumping while it types. */}
    <span aria-hidden="true" className="invisible">{text}</span>
    <span aria-hidden="true" className="absolute inset-0">
      <span className={`[box-decoration-break:clone] transition-colors duration-700 ${done ? "bg-transparent" : "bg-[#131D33]/85"}`}>{text.slice(0, count)}</span>
      <span className={`relative inline-block h-[1em] w-0 align-[-.12em] transition-opacity duration-500 ${done ? "opacity-0" : "opacity-100"}`}>
        <span className="absolute -top-[.08em] bottom-[-.08em] left-0 w-[2px] bg-[#5B8DEF]" />
        <span className="absolute -bottom-[.3em] -left-[.13em] size-[.3em] rounded-full bg-[#5B8DEF]" />
      </span>
    </span>
  </h1>;
}
