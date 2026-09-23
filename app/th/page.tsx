import { HomePage, homeMetadata } from "@/components/home/home-page";

export const metadata = homeMetadata("th");

export default function ThaiHome() {
  return <HomePage locale="th" />;
}
