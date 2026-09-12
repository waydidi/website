"use client";

import { CarFront, ChevronDown, Menu } from "lucide-react";
import { WaydidiLogo } from "@/components/waydidi-logo";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { usePathname } from "next/navigation";

export function PublicPathHeader() {
  const pathname = usePathname();
  if (pathname === "/" || pathname.startsWith("/booking/confirmation") || pathname.startsWith("/admin") || pathname.startsWith("/driver")) return null;
  return <div className="public-path-header"><PublicHeader /></div>;
}

export function PublicHeader() {
  return <header className="sticky top-0 z-50 flex h-[102px] w-full items-center justify-between bg-[#FF8A05] px-5 text-white shadow-sm lg:px-8">
    <a href="/" className="inline-flex text-white" aria-label="Waydidi home"><WaydidiLogo className="h-14 w-auto sm:h-[62px]" /></a>
    <nav className="hidden items-center gap-10 text-base font-semibold xl:flex">
      <details className="group relative"><summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">Ride <ChevronDown size={18}/></summary><div className="absolute right-0 top-full mt-5 w-56 rounded-2xl bg-white p-2 text-[#21140A] shadow-xl"><a href="/#services" className="block rounded-xl px-4 py-3 hover:bg-orange-50">Airport transfer</a><a href="/#services" className="block rounded-xl px-4 py-3 hover:bg-orange-50">A to B</a><a href="/#services" className="block rounded-xl px-4 py-3 hover:bg-orange-50">Long journey</a></div></details>
      <details className="group relative"><summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">Trip <ChevronDown size={18}/></summary><div className="absolute right-0 top-full mt-5 w-56 rounded-2xl bg-white p-2 text-[#21140A] shadow-xl"><a href="/#services" className="block rounded-xl px-4 py-3 hover:bg-orange-50">Day trip</a><a href="/#services" className="block rounded-xl px-4 py-3 hover:bg-orange-50">Multi-day trip</a><a href="/#services" className="block rounded-xl px-4 py-3 hover:bg-orange-50">Dinner cruise</a></div></details>
      <a href="/#support">About Waydidi</a><span className="flex items-center gap-2">🇹🇭 EN <ChevronDown size={18}/></span><a href="/booking/manage" className="flex h-12 items-center gap-2 rounded-full bg-white px-6 font-bold text-[#D96F00]"><CarFront size={20}/> Manage your booking</a>
    </nav>
    <Sheet><SheetTrigger asChild><button className="flex items-center gap-3 text-lg font-bold xl:hidden" aria-label="Open navigation menu">Menu <Menu/></button></SheetTrigger><SheetContent side="right" className="w-[min(430px,92vw)] max-w-none bg-white p-0 text-black sm:max-w-[430px]"><SheetHeader className="border-b border-slate-200 px-6 py-5"><SheetTitle className="text-left text-[#FF8A05]">Waydidi menu</SheetTitle></SheetHeader><nav className="grid gap-1 px-6 py-5 text-lg font-bold"><SheetClose asChild><a href="/#services" className="rounded-xl px-3 py-3 hover:bg-orange-50">Airport transfer</a></SheetClose><SheetClose asChild><a href="/#services" className="rounded-xl px-3 py-3 hover:bg-orange-50">A to B</a></SheetClose><SheetClose asChild><a href="/#services" className="rounded-xl px-3 py-3 hover:bg-orange-50">Long journey</a></SheetClose><SheetClose asChild><a href="/#services" className="rounded-xl px-3 py-3 hover:bg-orange-50">Day trip</a></SheetClose><SheetClose asChild><a href="/#support" className="rounded-xl px-3 py-3 hover:bg-orange-50">About Waydidi</a></SheetClose></nav><div className="mt-auto border-t border-slate-200 p-6"><div className="mb-3 rounded-2xl border border-slate-200 px-4 py-4 font-bold">🇹🇭 &nbsp; English</div><SheetClose asChild><a href="/booking/manage" className="flex items-center justify-center gap-2 rounded-full bg-[#FF8A05] px-5 py-4 font-bold text-white"><CarFront size={20}/> Manage your booking</a></SheetClose></div></SheetContent></Sheet>
  </header>;
}
