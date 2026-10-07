// Content kit for partners: popular routes with a photo and ready-to-post captions in English, Thai
// and Chinese. {link}, {code} and {discount} are filled in with the partner's own; {price} with the
// "from" price set in Admin → Partners → Affiliates (the line is left out until a price is set).

export type KitLang = "en" | "th" | "zh";
export type KitRoute = {
  id: string; image: string; pickup: string; dropoff: string;
  title: Record<KitLang, string>; caption: Record<KitLang, string>;
};

export const KIT_ROUTES: KitRoute[] = [
  {
    id: "bkk-city", image: "/destinations/bangkok.webp", pickup: "Suvarnabhumi Airport (BKK)", dropoff: "Bangkok",
    title: { en: "Suvarnabhumi Airport → Bangkok city", th: "สนามบินสุวรรณภูมิ → ในเมืองกรุงเทพฯ", zh: "素万那普机场 → 曼谷市区" },
    caption: {
      en: "Landing at Suvarnabhumi? Skip the taxi queue. Your private driver waits at arrivals and takes you straight to your Bangkok hotel.{price} Book with my code {code} for {discount}% off: {link}",
      th: "ลงเครื่องที่สุวรรณภูมิ ไม่ต้องต่อคิวแท็กซี่ คนขับส่วนตัวรอรับที่ช่องผู้โดยสารขาเข้า พาไปส่งถึงโรงแรมในกรุงเทพฯ{price} ใช้โค้ด {code} ลด {discount}% จองได้ที่ {link}",
      zh: "抵达素万那普机场？不用排队打车。专属司机在到达大厅等候，直接送您到曼谷酒店。{price} 使用我的优惠码 {code} 立减 {discount}%：{link}",
    },
  },
  {
    id: "bkk-pattaya", image: "/destinations/pattaya.webp", pickup: "Bangkok", dropoff: "Pattaya",
    title: { en: "Bangkok → Pattaya", th: "กรุงเทพฯ → พัทยา", zh: "曼谷 → 芭提雅" },
    caption: {
      en: "Bangkok to Pattaya door to door in about 2 hours, in your own private car. Pickup from your hotel or the airport.{price} Use my code {code} for {discount}% off: {link}",
      th: "กรุงเทพฯ ไปพัทยา ส่งถึงที่ประมาณ 2 ชั่วโมง ด้วยรถส่วนตัว รับจากโรงแรมหรือสนามบิน{price} ใช้โค้ด {code} ลด {discount}%: {link}",
      zh: "曼谷到芭提雅门到门，约2小时，专车接送，可从酒店或机场出发。{price} 使用优惠码 {code} 立减 {discount}%：{link}",
    },
  },
  {
    id: "hkt-patong", image: "/destinations/phuket.webp", pickup: "Phuket International Airport (HKT)", dropoff: "Patong",
    title: { en: "Phuket Airport → Patong", th: "สนามบินภูเก็ต → ป่าตอง", zh: "普吉机场 → 芭东海滩" },
    caption: {
      en: "Phuket Airport to Patong with a private driver waiting at arrivals. Fixed price, no haggling.{price} My code {code} gives you {discount}% off: {link}",
      th: "จากสนามบินภูเก็ตไปป่าตอง มีคนขับรอรับที่ขาเข้า ราคาคงที่ ไม่ต้องต่อรอง{price} ใช้โค้ด {code} ลด {discount}%: {link}",
      zh: "普吉机场到芭东海滩，司机在到达口等候，一口价，无需讨价还价。{price} 使用优惠码 {code} 立减 {discount}%：{link}",
    },
  },
  {
    id: "kbv-aonang", image: "/destinations/krabi.webp", pickup: "Krabi International Airport (KBV)", dropoff: "Ao Nang",
    title: { en: "Krabi Airport → Ao Nang", th: "สนามบินกระบี่ → อ่าวนาง", zh: "甲米机场 → 奥南海滩" },
    caption: {
      en: "From Krabi Airport to Ao Nang beach in about 40 minutes, private car, driver meets you at arrivals.{price} Use code {code} for {discount}% off: {link}",
      th: "จากสนามบินกระบี่ถึงอ่าวนางประมาณ 40 นาที รถส่วนตัว คนขับรอรับที่ขาเข้า{price} ใช้โค้ด {code} ลด {discount}%: {link}",
      zh: "甲米机场到奥南海滩约40分钟，专车接送，司机到达口迎接。{price} 使用优惠码 {code} 立减 {discount}%：{link}",
    },
  },
  {
    id: "bkk-huahin", image: "/destinations/hua-hin.webp", pickup: "Bangkok", dropoff: "Hua Hin",
    title: { en: "Bangkok → Hua Hin", th: "กรุงเทพฯ → หัวหิน", zh: "曼谷 → 华欣" },
    caption: {
      en: "Bangkok to Hua Hin in one comfortable private car, with a stop on the way if you like.{price} Book with my code {code} and save {discount}%: {link}",
      th: "กรุงเทพฯ ไปหัวหิน รถส่วนตัวคันเดียวถึงที่ แวะพักระหว่างทางได้{price} ใช้โค้ด {code} ลด {discount}%: {link}",
      zh: "曼谷到华欣，一辆舒适专车直达，途中可停靠休息。{price} 使用优惠码 {code} 立减 {discount}%：{link}",
    },
  },
  {
    id: "bkk-kohchang", image: "/destinations/koh-chang.webp", pickup: "Bangkok", dropoff: "Koh Chang",
    title: { en: "Bangkok → Koh Chang (car ferry included)", th: "กรุงเทพฯ → เกาะช้าง (รวมค่าเรือเฟอร์รี่)", zh: "曼谷 → 象岛（含汽车渡轮）" },
    caption: {
      en: "Bangkok straight to your Koh Chang hotel: the car goes on the ferry with you, and the ferry tickets are included.{price} Use code {code} for {discount}% off: {link}",
      th: "จากกรุงเทพฯ ตรงถึงโรงแรมบนเกาะช้าง รถลงเรือเฟอร์รี่ไปพร้อมคุณ รวมค่าตั๋วเรือแล้ว{price} ใช้โค้ด {code} ลด {discount}%: {link}",
      zh: "从曼谷直达象岛酒店：车辆随您一起上渡轮，已含渡轮票。{price} 使用优惠码 {code} 立减 {discount}%：{link}",
    },
  },
  {
    id: "bkk-ayutthaya", image: "/destinations/ayutthaya.webp", pickup: "Bangkok", dropoff: "Ayutthaya",
    title: { en: "Bangkok → Ayutthaya", th: "กรุงเทพฯ → อยุธยา", zh: "曼谷 → 大城" },
    caption: {
      en: "Visit the ancient capital the easy way: Bangkok to Ayutthaya in about 1.5 hours by private car.{price} My code {code} gives {discount}% off: {link}",
      th: "เที่ยวกรุงเก่าแบบสบาย จากกรุงเทพฯ ถึงอยุธยาประมาณ 1.5 ชั่วโมงด้วยรถส่วนตัว{price} ใช้โค้ด {code} ลด {discount}%: {link}",
      zh: "轻松游览古都：曼谷到大城专车约1.5小时。{price} 使用优惠码 {code} 立减 {discount}%：{link}",
    },
  },
  {
    id: "bkk-kanchanaburi", image: "/destinations/kanchanaburi.webp", pickup: "Bangkok", dropoff: "Kanchanaburi",
    title: { en: "Bangkok → Kanchanaburi", th: "กรุงเทพฯ → กาญจนบุรี", zh: "曼谷 → 北碧府" },
    caption: {
      en: "River Kwai, waterfalls and quiet resorts: Bangkok to Kanchanaburi in your own private car.{price} Use my code {code} for {discount}% off: {link}",
      th: "แม่น้ำแคว น้ำตก และรีสอร์ทเงียบสงบ เดินทางจากกรุงเทพฯ ไปกาญจนบุรีด้วยรถส่วนตัว{price} ใช้โค้ด {code} ลด {discount}%: {link}",
      zh: "桂河、瀑布与宁静度假村：从曼谷专车前往北碧府。{price} 使用优惠码 {code} 立减 {discount}%：{link}",
    },
  },
];

const PRICE_LINE: Record<KitLang, (p: number) => string> = {
  en: (p) => ` From ฿${p.toLocaleString("en-US")} per car.`,
  th: (p) => ` เริ่มต้น ฿${p.toLocaleString("en-US")} ต่อคัน`,
  zh: (p) => ` 每车 ฿${p.toLocaleString("en-US")} 起。`,
};

/** A caption ready to post, with the partner's link, code and discount (and the "from" price when set). */
export function kitCaption(route: KitRoute, lang: KitLang, p: { link: string; code: string; discount: number; price?: number | null }) {
  return route.caption[lang]
    .replace("{price}", p.price ? PRICE_LINE[lang](p.price) : "")
    .replace("{code}", p.code).replace("{discount}", String(p.discount)).replace("{link}", p.link);
}
