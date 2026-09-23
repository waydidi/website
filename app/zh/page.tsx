import { HomePage, homeMetadata } from "@/components/home/home-page";

export const metadata = homeMetadata("zh");

export default function ChineseHome() {
  return <HomePage locale="zh" />;
}
