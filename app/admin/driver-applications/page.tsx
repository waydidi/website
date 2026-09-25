import { redirect } from "next/navigation";

// Applications now live on Driver management.
export default function DriverApplicationsPage() {
  redirect("/admin/drivers?tab=applications");
}
