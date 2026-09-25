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
      WebkitMaskImage: "url('/waydidi-bird.png')",
      maskImage: "url('/waydidi-bird.png')",
      WebkitMaskPosition: "center",
      maskPosition: "center",
      WebkitMaskRepeat: "no-repeat",
      maskRepeat: "no-repeat",
      WebkitMaskSize: "contain",
      maskSize: "contain",
    }}
  />;
}

/**
 * The "Waydidi" wordmark without the bird. Masks just the text region of
 * the logo image (x 266–724, y 104–219 of 810×308), so its box is 459:116.
 */
export function WaydidiWordmark({ className }: { className?: string }) {
  return <span
    role="img"
    aria-label="Waydidi"
    className={cn("inline-block shrink-0 bg-current", className)}
    style={{
      aspectRatio: "459 / 116",
      WebkitMaskImage: "url('/waydidi-logo.png')",
      maskImage: "url('/waydidi-logo.png')",
      // Image scaled so the text region fills the box, then offset onto it.
      WebkitMaskSize: "176.47% auto",
      maskSize: "176.47% auto",
      WebkitMaskPosition: "75.78% 54.17%",
      maskPosition: "75.78% 54.17%",
      WebkitMaskRepeat: "no-repeat",
      maskRepeat: "no-repeat",
    }}
  />;
}
