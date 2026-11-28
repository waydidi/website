import { customerLocale } from "@/lib/sales-ai/quote-rules";

const questions = {
  en: {
    hours: /^(?:(?:what are )?(?:your |waydidi'?s )?(?:opening|business|office|service) hours|when (?:are you open|do you (?:open|close))|what time do you (?:open|close))$/,
    contact: /^(?:how (?:can|do) i (?:contact|reach) (?:you|waydidi)|(?:what (?:is|are) )?(?:your |waydidi'?s )?(?:contact (?:details|information|number)|phone number|email(?: address)?|whatsapp number))$/,
    payment: /^(?:how (?:do|can) i pay|how to pay|(?:what )?payment (?:methods|options)(?: do you accept)?|what are your payment (?:methods|options)|what (?:payment methods|forms of payment) (?:can i use|are available))$/,
  },
  th: {
    hours: /^(?:เวลาเปิด(?:ทำการ)?|เวลาทำการ|เปิดกี่โมง|ปิดกี่โมง|เปิด(?:ทำการ)?เวลาไหน)$/,
    contact: /^(?:ติดต่อ(?:waydidi|คุณ)?(?:ได้)?(?:ทางไหน|อย่างไร|ยังไง)|ช่องทางติดต่อ|(?:ขอ)?เบอร์โทร(?:ศัพท์)?|(?:ขอ)?อีเมล)$/,
    payment: /^(?:จ่าย(?:เงิน)?(?:ยังไง|อย่างไร|แบบไหน)|ชำระ(?:เงิน)?(?:ยังไง|อย่างไร)|วิธีชำระเงิน|ช่องทางชำระเงิน|ชำระเงินได้ทางไหน)$/,
  },
  zh: {
    hours: /^(?:营业时间|營業時間|服务时间|服務時間|几点开门|幾點開門|你们(?:几点营业|什么时候营业|的营业时间))$/,
    contact: /^(?:联系方式|聯絡方式|怎么联系你们|如何联系你们|如何聯絡你們|联系电话|聯絡電話|你们的电话号码|电子邮箱)$/,
    payment: /^(?:怎么付(?:款|钱)|如何付款|怎麼付(?:款|錢)|怎么支付|支付方式|付款方式|支持哪些付款方式|可以怎么付款)$/,
  },
};

export function fixedQuestion(text: string) {
  if (text.length > 120) return null;
  const locale = customerLocale(text);
  const normalized = text.normalize("NFKC").toLowerCase().trim()
    .replace(/[?!。！]+$/, "").trim().replace(/ +/g, " ");
  const question = locale === "th" ? normalized.replace(/\s*(?:ครับ|ค่ะ|คะ)$/, "") : normalized.replace(/’/g, "'");
  const kind = (["hours", "contact", "payment"] as const).find((key) => questions[locale][key].test(question));
  return kind ? { kind, locale } : null;
}
