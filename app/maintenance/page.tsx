import type { Metadata } from "next";
import { AnimatedScene } from "@/components/maintenance/animated-scene";
import { MaintenanceSignIn } from "@/components/maintenance/sign-in";
import { WaydidiWordmark } from "@/components/waydidi-logo";

export const metadata: Metadata = { title: "Waydidi · Back soon", robots: { index: false, follow: false } };

// Shown to visitors while the site is in maintenance mode (Admin → Settings), over the animated Bangkok scene.
export default function MaintenancePage() {
  return <AnimatedScene>
    {/* Message */}
    <div className="relative z-20 mx-auto flex max-w-xl flex-col items-center px-6 pt-[26vh] text-center sm:pt-[24vh]">
      <WaydidiWordmark className="fade h-[44px] w-[174px] text-white" />
      <h1 className="fade mt-5 text-[30px] font-bold leading-tight [animation-delay:.3s] sm:text-[40px]">We&apos;ll be right back</h1>
      <p className="fade mt-3 text-[16px] leading-7 text-white/95 [animation-delay:.6s] sm:text-[18px]">Waydidi is getting a little upgrade. Your bookings and rides are not affected. Need help now? Message us on WhatsApp.</p>
      <a href="https://wa.me/66632064884" className="fade mt-6 inline-flex h-12 items-center rounded-full bg-white px-6 font-semibold text-[#C96100] shadow-sm [animation-delay:.9s] hover:bg-[#FFF6EC]">WhatsApp +66 63 206 4884</a>
    </div>

    <MaintenanceSignIn />
  </AnimatedScene>;
}
