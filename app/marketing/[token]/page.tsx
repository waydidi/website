import { Unsubscribe } from "@/components/crm/unsubscribe";
export const metadata={title:'Email preferences · Waydidi',robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{token:string}>}){const {token}=await params;return <main className="mx-auto max-w-lg p-8"><h1 className="text-2xl font-semibold">Waydidi email preferences</h1><p className="my-5">Stop promotional emails from Waydidi. Essential booking and service messages will continue.</p><Unsubscribe token={token}/></main>;}
