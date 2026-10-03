import Link from "next/link";

// Nearby areas link to the existing destination page that describes their coverage.
const transferAreas = [
  { name: "Bangkok", destination: "bangkok" },
  { name: "Koh Chang", destination: "koh-chang" },
  { name: "Pattaya", destination: "pattaya" },
  { name: "Phuket", destination: "phuket" },
  { name: "Krabi", destination: "krabi" },
  { name: "Hua Hin", destination: "hua-hin" },
  { name: "Ayutthaya", destination: "ayutthaya" },
  { name: "Kanchanaburi", destination: "kanchanaburi" },
  { name: "Koh Kood", destination: "koh-kood" },
  { name: "Ao Nang", destination: "krabi" },
  { name: "Patong", destination: "phuket" },
  { name: "Jomtien", destination: "pattaya" },
  { name: "Kata", destination: "phuket" },
  { name: "Cha-am", destination: "hua-hin" },
  { name: "Karon", destination: "phuket" },
  { name: "Pranburi", destination: "hua-hin" },
  { name: "Bang Tao", destination: "phuket" },
  { name: "Rawai", destination: "phuket" },
];

export function TransferLinks() {
  return <section aria-label="Transfers across Thailand" className="bg-[#EAECF1] px-3 py-[10px] sm:px-5 sm:py-5" style={{ fontFamily: 'Arial, "Helvetica Neue", Helvetica, sans-serif' }}>
    <nav aria-label="Thailand transfer destinations" className="mx-auto max-w-[1180px] rounded-[8px] border border-[#F2F3F5] bg-white px-4 py-4 shadow-[0_2px_8px_rgba(25,42,65,.04)]">
      <ul className="grid grid-cols-2 gap-x-4 gap-y-[14px] text-[clamp(11px,3.4vw,15px)] font-normal leading-5 text-[#192E49]">
        {transferAreas.map(area => <li key={area.name}>
          <Link href={`/destinations/${area.destination}`} className="block w-fit whitespace-nowrap rounded-sm hover:underline hover:underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#FE8B05]">Transfer in {area.name}</Link>
        </li>)}
      </ul>
    </nav>
  </section>;
}
