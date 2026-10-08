"use client";

import { useEffect, useState } from "react";

export function useScrollHidden(resetKey: string, pinned: boolean) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- navigation and an open menu restore the bar
    setHidden(false);
    let anchor = window.scrollY;
    let frame = 0;
    const update = () => {
      frame = 0;
      // Clamp rubber-band overscroll so bouncing at either edge cannot hide the bar.
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const y = Math.max(0, Math.min(window.scrollY, max));
      if (pinned || y <= 16) {
        setHidden(false);
        anchor = y;
      } else if (Math.abs(y - anchor) >= 8) {
        setHidden(y > anchor);
        anchor = y;
      }
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.cancelAnimationFrame(frame);
    };
  }, [resetKey, pinned]);

  return hidden && !pinned;
}
