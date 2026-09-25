"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { SpinWheelDialog } from "./spin-wheel";

const CLOSED_KEY = "waydidi_spin_bar_closed";
const HIDDEN_ON = ["/admin", "/driver", "/trip/", "/booking/confirmation", "/account/sign-in"];
const isHome = (p: string) => p === "/" || p === "/th" || p === "/zh";
const point = (i: number, r = 16) => {
  const a = ((i * 60 - 90) * Math.PI) / 180;
  return `${20 + r * Math.cos(a)} ${21 + r * Math.sin(a)}`;
};

function WheelIcon() {
  return <svg viewBox="0 0 40 40" className="size-10 shrink-0" aria-hidden="true">
    {[0, 1, 2, 3, 4, 5].map((i) => <path key={i} d={`M20 21 L${point(i)} A16 16 0 0 1 ${point(i + 1)} Z`} fill={i % 2 ? "#8EA0FA" : "#3D5AF1"} />)}
    <circle cx="20" cy="21" r="5" fill="#fff" />
    <path d="M16 1 h8 l-4 7 z" fill="#15161C" />
  </svg>;
}

// Bottom sheet "Sign in to spin the wheel!". Always shown on the homepage; on other
// pages it stays until the visitor closes it with X. Hidden once the member has spun.
export function SpinBar() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [state, setState] = useState<{ signedIn: boolean; spun: boolean } | null>(null);
  const [closed, setClosed] = useState(true);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [bookingBusy, setBookingBusy] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try { dismissed = localStorage.getItem(CLOSED_KEY) === "1"; } catch { /* storage blocked */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setClosed(!isHome(pathname) && dismissed);
    const timer = window.setTimeout(() => setReady(true), 1200);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    let active = true;
    const load = () => fetch("/api/spin", { cache: "no-store" }).then((r) => r.json()).then((d: { signedIn?: boolean; spun?: boolean }) => { if (active) setState({ signedIn: Boolean(d.signedIn), spun: Boolean(d.spun) }); }).catch(() => undefined);
    void load();
    window.addEventListener("waydidi:spun", load);
    return () => { active = false; window.removeEventListener("waydidi:spun", load); };
  }, []);

  // Back from sign-in with ?spin=1: open the wheel straight away.
  useEffect(() => {
    if (!state?.signedIn || state.spun) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("spin") !== "1") return;
    params.delete("spin");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(true);
  }, [state]);

  // Stay out of the way of the booking flow's own bottom buttons.
  useEffect(() => {
    const root = document.documentElement;
    const check = () => setBookingBusy(Boolean(root.dataset.bookingStage && root.dataset.bookingStage !== "search"));
    check();
    const observer = new MutationObserver(check);
    observer.observe(root, { attributes: true, attributeFilter: ["data-booking-stage"] });
    return () => observer.disconnect();
  }, []);

  if (open) return <SpinWheelDialog onClose={() => setOpen(false)} />;
  if (!state || state.spun || closed || bookingBusy || HIDDEN_ON.some((p) => pathname.startsWith(p))) return null;

  function close() {
    setClosed(true);
    if (!isHome(pathname)) { try { localStorage.setItem(CLOSED_KEY, "1"); } catch { /* storage blocked */ } }
  }
  function go() {
    if (state?.signedIn) { setOpen(true); return; }
    router.push(`/account/sign-in?next=${encodeURIComponent(`${pathname}?spin=1`)}`);
  }

  return <div className={`no-print fixed inset-x-0 bottom-0 z-[45] transition-transform duration-500 ${ready ? "translate-y-0" : "translate-y-[140%]"}`}>
    <div className="relative mx-auto max-w-[680px]">
      <button type="button" onClick={close} aria-label="Close" className="absolute -top-14 right-3 grid size-11 place-items-center rounded-full bg-[#2B2B33]/85 text-white shadow-lg backdrop-blur hover:bg-[#2B2B33]"><X size={22} strokeWidth={2.6} /></button>
      <div className="flex items-center gap-3 rounded-t-[22px] border border-b-0 border-[#E6E6EE] bg-white px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-4 shadow-[0_-8px_28px_rgba(0,0,0,.10)] sm:px-5">
        <WheelIcon />
        <p className="min-w-0 flex-1 text-[17px] font-bold leading-snug text-[#15161C] sm:text-[19px]">{state.signedIn ? "Spin the wheel to win a discount!" : "Sign in to spin the wheel!"}</p>
        <button type="button" onClick={go} className="h-12 shrink-0 rounded-[10px] bg-[#3D5AF1] px-5 text-[16px] font-semibold text-white hover:bg-[#2F4BE0]">{state.signedIn ? "Spin" : "Continue"}</button>
      </div>
    </div>
  </div>;
}
