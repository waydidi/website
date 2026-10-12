import { HomePage, homeMetadata } from "@/components/home/home-page";
import { JsonLd, transferServiceSchema } from "@/components/seo";

export const metadata = homeMetadata("en");

export default function Home() {
  return <>
    <HomePage locale="en" />
    <JsonLd data={transferServiceSchema()} />
  </>;
}
