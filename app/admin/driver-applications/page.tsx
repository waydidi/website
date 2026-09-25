import { redirect } from "next/navigation";

// Applications now live on Drivers.
export default function DriverApplicationsPage() {
  redirect("/admin/drivers?tab=applications");
}
