import { cn } from "@/lib/utils";

export function WaydidiLogo({ className }: { className?: string }) {
  return <span
    role="img"
    aria-label="Waydidi"
    className={cn("inline-block shrink-0 bg-current", className)}
    style={{
      aspectRatio: "810 / 308",
      WebkitMaskImage: "url('/waydidi-logo.png')",
      maskImage: "url('/waydidi-logo.png')",
      WebkitMaskPosition: "center",
      maskPosition: "center",
      WebkitMaskRepeat: "no-repeat",
      maskRepeat: "no-repeat",
      WebkitMaskSize: "contain",
      maskSize: "contain",
    }}
  />;
}

export function WaydidiMark({ className }: { className?: string }) {
  return <span
    role="img"
    aria-label="Waydidi"
    className={cn("inline-block shrink-0 bg-current", className)}
    style={{
      aspectRatio: "1 / 1",
      WebkitMaskImage: "url('/waydidi-logo.png')",
      maskImage: "url('/waydidi-logo.png')",
      WebkitMaskPosition: "left center",
      maskPosition: "left center",
      WebkitMaskRepeat: "no-repeat",
      maskRepeat: "no-repeat",
      WebkitMaskSize: "auto 100%",
      maskSize: "auto 100%",
    }}
  />;
}
