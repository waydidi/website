"use client";

import { Camera, IdCard, LoaderCircle, Plus } from "lucide-react";
import { FormEvent, useRef, useState } from "react";
import { THAI_BANKS } from "@/lib/thai-banks";

export type CreatedDriver = {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  status: string;
  idImageKey?: string | null;
  carImageKey?: string | null;
};

export function DriverCreateForm({
  onCreated,
  darkButton = false,
}: {
  onCreated: (driver: CreatedDriver) => void | Promise<void>;
  darkButton?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [bankCode, setBankCode] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/drivers", {
        method: "POST",
        body: new FormData(event.currentTarget),
      });
      const result = (await response.json()) as {
        error?: string;
        driver?: CreatedDriver;
      };
      if (!response.ok || !result.driver)
        throw new Error(result.error ?? "Driver could not be added.");
      formRef.current?.reset();
      setBankCode("");
      await onCreated(result.driver);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Driver could not be added.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} className="mt-4 space-y-2">
    <div className="grid grid-cols-2 gap-2">
        <input
          required
          name="fullName"
          placeholder="Full name"
          className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 outline-none focus:border-[#FF8A05]"
        />
        <input
          required
          name="phone"
          placeholder="Phone number"
          className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 outline-none focus:border-[#FF8A05]"
        />
        <input
          required
          name="baseLocation"
          placeholder="Base location"
          className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 outline-none focus:border-[#FF8A05]"
        />
        <input
          required
          name="vehicle"
          placeholder="Car / vehicle"
          className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 outline-none focus:border-[#FF8A05]"
        />
        <input
          type="email"
          name="email"
          placeholder="Email for reminders (optional)"
          className="col-span-2 h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 outline-none focus:border-[#FF8A05]"
        />
    </div>
    <section className="rounded-2xl border border-slate-200 p-3">
      <p className="text-sm font-black">Bank account</p>
      <p className="mt-1 text-xs text-slate-500">
        Choose a Thai bank for driver payment.
      </p>
      <input type="hidden" name="bankCode" value={bankCode} />
      <div className="mt-3 grid max-h-44 grid-cols-2 gap-2 overflow-y-auto pr-1">
        {THAI_BANKS.map((bank) => (
          <button
            key={bank.code}
            type="button"
            onClick={() => setBankCode(bank.code)}
            className={`flex items-center gap-2 rounded-xl border p-2 text-left transition ${bankCode === bank.code ? "border-[#FF8A05] bg-orange-50" : "border-slate-200 bg-white hover:border-orange-200"}`}
          >
            {/* Official bank logos from the thai-banks-logo package (public/banks). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/banks/${bank.code}.png`} alt="" width={32} height={32} className="size-8 shrink-0 rounded-lg object-contain" />
            <span className="min-w-0">
              <span className="block truncate text-xs font-black">
                {bank.thai}
              </span>
              <span className="block truncate text-[11px] text-slate-500">
                {bank.name}
              </span>
            </span>
          </button>
        ))}
      </div>
      <input
        required
        name="bankAccountNumber"
        inputMode="numeric"
        autoComplete="off"
        placeholder="Bank account number"
        className="mt-3 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 outline-none focus:border-[#FF8A05]"
      />
      {!bankCode && (
        <p className="mt-2 text-xs font-semibold text-amber-700">
          Choose a bank before saving.
        </p>
      )}
    </section>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex min-h-20 cursor-pointer flex-col justify-center rounded-xl border border-dashed border-orange-200 bg-orange-50 px-3 text-xs font-bold text-[#B85D00] hover:bg-orange-100">
          <span className="flex items-center gap-2">
            <IdCard size={17} />
            Driving licence
          </span>
          <span className="mt-1 font-normal text-slate-500">
            JPG, PNG or WebP · max 8 MB
          </span>
          <input
            required
            name="idImage"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="mt-2 block w-full text-[11px] text-slate-600 file:mr-2 file:rounded-full file:border-0 file:bg-white file:px-2 file:py-1 file:font-bold"
          />
        </label>
        <label className="flex min-h-20 cursor-pointer flex-col justify-center rounded-xl border border-dashed border-orange-200 bg-orange-50 px-3 text-xs font-bold text-[#B85D00] hover:bg-orange-100">
          <span className="flex items-center gap-2">
            <Camera size={17} />
            Car image
          </span>
          <span className="mt-1 font-normal text-slate-500">
            Clear exterior photo
          </span>
          <input
            required
            name="carImage"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="mt-2 block w-full text-[11px] text-slate-600 file:mr-2 file:rounded-full file:border-0 file:bg-white file:px-2 file:py-1 file:font-bold"
          />
        </label>
      </div>
      {error && (
        <p className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">
          {error}
        </p>
      )}
      <button
      disabled={busy || !bankCode}
        className={`flex h-11 w-full items-center justify-center gap-2 rounded-full font-bold text-white disabled:opacity-50 ${darkButton ? "bg-[#211726]" : "bg-[#FF8A05]"}`}
      >
        {busy ? (
          <LoaderCircle size={17} className="animate-spin" />
        ) : (
          <Plus size={17} />
        )}{" "}
        {busy ? "Saving…" : "Add driver"}
      </button>
    </form>
  );
}
