"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Printer } from "lucide-react";
const fmt=(n:number)=>new Intl.NumberFormat("en-TH",{style:"currency",currency:"THB"}).format(n);
export default function ReceiptMaker() {
 const [number,setNumber]=useState(""),[date,setDate]=useState(""),[customer,setCustomer]=useState(""),[email,setEmail]=useState(""),[booking,setBooking]=useState(""),[method,setMethod]=useState("Bank transfer"),[note,setNote]=useState("");
 const [items,setItems]=useState([{description:"Private transfer",amount:""}]);
 const total=items.reduce((n,i)=>n+(Number(i.amount)||0),0);
 const input="mt-1 block w-full rounded-xl border border-slate-200 bg-white p-2.5";
 function submit(e:FormEvent){e.preventDefault();if(total<=0||!Number.isFinite(total))return;window.print();}
 return <main className="mx-auto max-w-6xl space-y-5">
 <div className="print:hidden"><Link href="/admin/financials" className="text-sm text-slate-600">← Financials</Link><h1 className="mt-2 text-2xl font-bold">Receipt Maker</h1><p className="text-sm text-slate-500">Manual receipts for verified payments. Does not modify payment or booking records.</p></div>
 <form onSubmit={submit} className="grid gap-5 lg:grid-cols-2 print:block">
 <section className="rounded-2xl bg-white p-5 shadow-sm print:hidden">
 <div className="grid grid-cols-2 gap-3"><label className="text-sm">Receipt number<input required maxLength={60} className={input} value={number} onChange={e=>setNumber(e.target.value)} placeholder="WD-R-0001"/></label><label className="text-sm">Payment date<input required type="date" className={input} value={date} onChange={e=>setDate(e.target.value)}/></label></div>
 <label className="mt-3 block text-sm">Customer name<input required maxLength={150} className={input} value={customer} onChange={e=>setCustomer(e.target.value)}/></label>
 <label className="mt-3 block text-sm">Email (optional)<input type="email" maxLength={150} className={input} value={email} onChange={e=>setEmail(e.target.value)}/></label>
 <label className="mt-3 block text-sm">Booking reference (optional)<input maxLength={80} className={input} value={booking} onChange={e=>setBooking(e.target.value)}/></label>
 <label className="mt-3 block text-sm">Payment method<select className={input} value={method} onChange={e=>setMethod(e.target.value)}>{["Bank transfer","Cash","Card","Other"].map(x=><option key={x}>{x}</option>)}</select></label>
 <h2 className="mt-5 mb-2 font-semibold">Paid services</h2>
 {items.map((item,j)=><div key={j} className="mb-2 flex gap-2"><input aria-label="Description" required maxLength={200} className={input} value={item.description} onChange={e=>setItems(a=>a.map((v,k)=>k===j?{...v,description:e.target.value}:v))}/><input aria-label="Amount in THB" required min="0.01" max="100000000" step="0.01" type="number" className={input+" max-w-28"} value={item.amount} onChange={e=>setItems(a=>a.map((v,k)=>k===j?{...v,amount:e.target.value}:v))}/>{items.length>1&&<button type="button" onClick={()=>setItems(a=>a.filter((_,k)=>k!==j))} aria-label="Remove item">×</button>}</div>)}
 <button type="button" className="text-sm font-semibold text-orange-700" onClick={()=>setItems(a=>[...a,{description:"",amount:""}])}>+ Add service</button>
 <label className="mt-4 block text-sm">Note<textarea rows={2} maxLength={600} className={input} value={note} onChange={e=>setNote(e.target.value)}/></label>
 <button type="submit" disabled={total<=0} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#FE8B05] p-3 font-bold text-white disabled:opacity-50"><Printer size={18}/> Print / Save as PDF</button>
 <p className="mt-2 text-xs text-slate-500">Only issue after verifying that payment was received. Not a VAT tax invoice.</p>
 </section>
 <section className="receipt-paper rounded-2xl bg-white p-8 shadow-sm print:shadow-none">
 <header className="flex items-start justify-between border-b-2 border-orange-400 pb-5"><div><h2 className="text-2xl font-black text-[#FE8B05]">Waydidi Travel</h2><p className="text-xs text-slate-500">Private transfers and day trips · Thailand</p></div><div className="text-right"><h2 className="text-2xl font-bold">RECEIPT</h2><p className="text-xs text-slate-500">Payment acknowledgement</p></div></header>
 <div className="mt-6 grid grid-cols-2 gap-4 text-sm"><div><p className="text-slate-500">Received from</p><p className="font-semibold break-words">{customer||"Customer name"}</p><p className="break-words">{email}</p></div><div className="text-right"><p>Receipt: {number||"—"}</p><p>Date: {date||"—"}</p><p>Method: {method}</p>{booking&&<p className="break-words">Booking: {booking}</p>}</div></div>
 <table className="mt-7 w-full text-left text-sm"><thead><tr className="border-b bg-slate-50"><th className="p-3">Service</th><th className="p-3 text-right">Amount (THB)</th></tr></thead><tbody>{items.map((item,i)=><tr key={i} className="border-b"><td className="p-3 break-words">{item.description||"—"}</td><td className="p-3 text-right">{fmt(Number(item.amount)||0)}</td></tr>)}</tbody></table>
 <p className="mt-5 text-right text-xl font-bold">Total received: {fmt(total)}</p>
 {note&&<p className="mt-6 whitespace-pre-wrap break-words text-sm">{note}</p>}
 <footer className="mt-12 border-t pt-4 text-xs text-slate-500">Thank you for traveling with Waydidi. This is a payment receipt, not a VAT tax invoice.</footer>
 </section></form>
 <style jsx global>{`@media print { @page {size:A4;margin:16mm} body * {visibility:hidden!important} .receipt-paper,.receipt-paper * {visibility:visible!important} .receipt-paper {position:absolute!important;left:0!important;top:0!important;width:100%!important;box-shadow:none!important;color:black!important;background:white!important} }`}</style>
 </main>;
}
