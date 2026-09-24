"use client";

import { useEffect, useState } from "react";

// Waymo-style text reveal: the headline is uncovered left to right in one
// smooth wipe. No highlight, no cursor.
export function TypedHeadline({ text, className }: { text: string; className?: string }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShown(false);
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
    return () => cancelAnimationFrame(frame);
  }, [text]);

  return <h1 className={className}>
    <span className={`inline-block transition-[clip-path] duration-[1400ms] ease-[cubic-bezier(.65,0,.35,1)] motion-reduce:transition-none ${shown ? "[clip-path:inset(0_0_0_0)]" : "[clip-path:inset(0_100%_0_0)]"}`}>{text}</span>
  </h1>;
}
