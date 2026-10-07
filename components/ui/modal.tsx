"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

// Waydidi's popup window, built on Radix Dialog: focus stays inside while open, Esc and a click
// outside close it (unless `locked`, e.g. while saving), focus returns to the button that opened it,
// and screen readers announce it with its title. The panel itself is styled by each caller.
export function Modal({ open, onClose, locked = false, sheet = false, overlayClassName, className, children, ...props }: {
  open: boolean;
  onClose: () => void;
  /** Ignore Esc and outside clicks (e.g. while a save is running). */
  locked?: boolean;
  /** Slide up from the bottom on phones, centred from `sm` up. */
  sheet?: boolean;
  overlayClassName?: string;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ComponentProps<typeof DialogPrimitive.Content>, "className" | "children">) {
  // Remember what had focus when the popup opened, so closing it puts focus back there.
  // (Tracks focus outside any dialog, because a field with autoFocus takes focus before Radix can record it.)
  const opener = React.useRef<HTMLElement | null>(null);
  React.useEffect(() => {
    const track = (e: FocusEvent) => { const t = e.target as HTMLElement | null; if (t && !t.closest?.('[role="dialog"]')) opener.current = t; };
    document.addEventListener("focusin", track);
    return () => document.removeEventListener("focusin", track);
  }, []);
  return <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next && !locked) onClose(); }}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={cn("fixed inset-0 z-50 flex justify-center overflow-y-auto bg-plum/50",
        sheet ? "items-end p-0 sm:items-center sm:p-4" : "items-center p-4", overlayClassName)}>
        <DialogPrimitive.Content aria-describedby={undefined} className={cn("relative w-full bg-white outline-none", className)} {...props}
          onCloseAutoFocus={(e) => { props.onCloseAutoFocus?.(e); if (!e.defaultPrevented && opener.current?.isConnected) { e.preventDefault(); opener.current.focus(); } }}>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Overlay>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}

export const ModalTitle = DialogPrimitive.Title;
export const ModalClose = DialogPrimitive.Close;
