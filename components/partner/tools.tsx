"use client";

import { Check, Copy, Printer } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

export function CopyRow({ label, value, shown }: { label: string; value: string; shown?: React.ReactNode }) {
  const [done, setDone] = useState(false);
  return <div className="flex items-center gap-2 rounded-xl border border-dashed border-[#F6B46E] bg-[#FFFAF4] px-3 py-2.5 text-[14px]">
    <span className="min-w-0 flex-1 truncate"><span className="text-slate-500">{label} </span>{shown ?? <b className="text-brand-darker">{value}</b>}</span>
    <button type="button" onClick={() => void navigator.clipboard.writeText(value).then(() => { setDone(true); window.setTimeout(() => setDone(false), 1500); })}
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-tint px-3 py-1 text-[12.5px] font-semibold text-brand-darker">{done ? <><Check size={14} />Copied</> : <><Copy size={14} />Copy</>}</button>
  </div>;
}

/** Make a link with the route already filled in, which turns visitors into bookings more often. */
export function LinkBuilder({ slug }: { slug: string }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const q = new URLSearchParams({ ref: slug });
  if (from.trim() || to.trim()) { q.set("rebook", "chat"); if (from.trim()) q.set("pickup", from.trim()); if (to.trim()) q.set("dropoff", to.trim()); }
  const link = `https://waydidi.com/?${q}`;
  const field = "h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-[14px] outline-none focus:border-brand";
  return <div className="grid gap-2">
    <div className="grid grid-cols-2 gap-2">
      <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="From, e.g. Phuket Airport" aria-label="From" className={field} />
      <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="To, e.g. Patong" aria-label="To" className={field} />
    </div>
    <CopyRow label="" value={link} shown={<span className="break-all font-mono text-[12.5px] text-slate-700">{link}</span>} />
    <PartnerQr url={link} name="" code="" discount={0} compact />
  </div>;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
/** Printable A4 poster with the partner's QR code (same style as the store posters). */
function printPoster(svg: string, url: string, name: string, code: string, discount: number) {
  const w = window.open("", "_blank", "width=800,height=1000");
  if (!w) return;
  w.document.write(`<!doctype html><html><head><title>${esc(name || "Waydidi")} · Waydidi QR poster</title><style>
@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#1F1726}
.p{width:210mm;height:297mm;display:flex;flex-direction:column}.top{background:#FF8A05;color:#fff;padding:18mm 16mm 14mm;text-align:center}
.top img{width:62mm}.top h1{font-size:34pt;margin:10mm 0 3mm;line-height:1.05}.top p{font-size:15pt;margin:0;opacity:.95}
.mid{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6mm;padding:10mm}
.qr{width:120mm;height:120mm;padding:5mm;border:3px solid #FF8A05;border-radius:10mm}.qr svg{width:100%;height:100%}
.deal{font-size:22pt;font-weight:700;color:#15803D}.by{font-size:14pt;color:#6B6170}.url{font-size:11pt;color:#6B6170}
.bot{background:#FFF0DF;padding:7mm;text-align:center;font-size:13pt}</style></head><body><div class="p">
<div class="top"><img src="${location.origin}/waydidi-logo.png" alt="Waydidi"><h1>Scan to book<br>your private ride</h1><p>Airport transfers · City rides · Day trips in Thailand</p></div>
<div class="mid"><div class="qr">${svg}</div>${code && discount > 0 ? `<div class="deal">${discount}% off with code ${esc(code)}</div>` : ""}${name ? `<div class="by">Recommended by ${esc(name)}</div>` : ""}<div class="url">${esc(url.replace(/^https:\/\//, ""))}</div></div>
<div class="bot">Private driver · Fixed price · Confirmation by email and WhatsApp</div></div>
<script>setTimeout(function(){window.print()},600)</script></body></html>`);
  w.document.close();
}

/** QR code for a partner link, with a download and a printable poster. */
export function PartnerQr({ url, name, code, discount, compact }: { url: string; name: string; code: string; discount: number; compact?: boolean }) {
  const [svg, setSvg] = useState("");
  useEffect(() => { void QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#1F1726", light: "#ffffff" } }).then(setSvg); }, [url]);
  const download = () => { const a = document.createElement("a"); a.href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; a.download = "waydidi-qr.svg"; a.click(); };
  return <div className={`flex items-center gap-4 ${compact ? "" : "rounded-xl bg-slate-50 p-3"}`}>
    {/* SVG made by the qrcode library from our own URL */}
    <div className={`${compact ? "size-[84px]" : "size-[112px]"} shrink-0 rounded-lg border border-slate-200 bg-white p-1 [&_svg]:h-full [&_svg]:w-full`} dangerouslySetInnerHTML={{ __html: svg }} aria-label="QR code" role="img" />
    <div className="grid gap-1.5">
      <button type="button" disabled={!svg} onClick={() => printPoster(svg, url, name, code, discount)} className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-brand-strong"><Printer size={15} />Print A4 poster</button>
      <button type="button" disabled={!svg} onClick={download} className="rounded-full px-3.5 py-1.5 text-[13px] font-semibold text-brand-darker hover:bg-brand-tint">Download QR</button>
    </div>
  </div>;
}
