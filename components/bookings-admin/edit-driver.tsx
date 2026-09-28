"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DriverPicker, type PickerDriver } from "@/components/bookings-admin/driver-picker";

// "Edit" in the bookings list: choose or change the driver in a small popup.
export function EditDriverButton({ reference, drivers, current, canAssign }: { reference: string; drivers: PickerDriver[]; current: string | null; canAssign: boolean }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen(true)} className="text-[14px] font-semibold text-[#C96100] hover:underline">Edit</button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="rounded-[24px] border-0 bg-white p-6 text-slate-900 sm:max-w-sm">
        <DialogTitle className="text-[20px] font-semibold">Edit {reference}</DialogTitle>
        <DialogDescription>{canAssign ? "Choose the driver for this booking." : "Drivers can only be assigned to confirmed bookings."}</DialogDescription>
        <div className="mt-2"><span className="mb-1.5 block text-[13px] font-medium text-slate-600">Driver</span><DriverPicker reference={reference} drivers={drivers} current={current} canAssign={canAssign} wide /></div>
      </DialogContent>
    </Dialog>
  </>;
}
