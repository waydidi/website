import type { ReactNode } from "react";
import AdminShell from "@/components/admin-shell";
import { getWaydidiAdmin } from "@/lib/admin";
import { purgeExpiredBookings } from "@/lib/booking-bin";

export default async function AdminLayout({children}:{children:ReactNode}){
  const admin=await getWaydidiAdmin();
  if(!admin)return children;
  await purgeExpiredBookings();
  return <AdminShell email={admin.email}>{children}</AdminShell>;
}
