"use client";

import { useEffect, useState } from "react";

// The headline types in letter by letter (no highlight, no cursor).
export function TypedHeadline({ text, className }: { text: string; className?: string }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCount(text.length); return;
    }
    setCount(0);
    let i = 0;
    const timer = window.setInterval(() => {
      i += 1; setCount(i);
      if (i >= text.length) window.clearInterval(timer);
    }, 55);
    return () => window.clearInterval(timer);
  }, [text]);

  return <h1 className={`relative ${className ?? ""}`} aria-label={text}>
    {/* Full text keeps the layout from jumping while it types. */}
    <span aria-hidden="true" className="invisible">{text}</span>
    <span aria-hidden="true" className="absolute inset-0">{text.slice(0, count)}</span>
  </h1>;
}
