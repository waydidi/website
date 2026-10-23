// Customer-facing words for smart trips (itinerary page, Your day, rating, emails), in
// the language set on the trip. Attraction names and descriptions stay as staff wrote them.
export type TripLang = "en" | "th" | "zh";

const en = {
  privateTrip: "Your private day trip", multiDay: "Your private {n}-day trip", preparedBy: "Prepared by {agency} with Waydidi",
  pickup: "Pickup {time}", backAround: "Back around {time}", travellers: "{n} travellers", traveller: "1 traveller",
  paidTitle: "Booked and paid", paidText: "Your confirmation is in your email. On the day, follow your driver and the next stop live.", openYourDay: "Open “Your day”",
  updating: "We're updating your itinerary", updatingText: "Thanks for your request. You'll get a new version soon; this page will show it.",
  yourDay: "Your day", day: "Day {n}", hotelPickup: "Hotel pickup", backAtHotel: "Back at your hotel",
  open: "open {hours}", sessionCheckIn: "Session at {time}: check in by {checkIn}", timesNote: "Times are estimates and may change with traffic. Your driver may adjust the route for weather or local conditions.",
  whatToBring: "What to bring", notes: "Notes", price: "Price", transport: "Private car, driver, fuel and tolls", tickets: "Tickets included", discount: "Discount", total: "Total",
  plusFees: "Plus about {amount} in entrance fees paid on the day.", expired: "This price has expired. Please contact us and we'll confirm it again.",
  downloadPdf: "Download the itinerary (PDF)", refLine: "Reference {ref} · version {v}. Free cancellation up to {hours} hours before pickup; see the", policy: "cancellation policy",
  acceptPay: "Accept and pay {amount}", askChange: "Ask for a change", yourDetails: "Your details", fullName: "Full name", email: "Email", phone: "Phone (WhatsApp or LINE)",
  acceptTerms: "I accept the {terms} and the {policy}.", terms: "terms", paySecure: "Pay {amount} securely", back: "Back",
  changeQ: "What would you like to change?", changePlaceholder: "e.g. Can we start at 9:00 and add a beach stop?", sendRequest: "Send request",
  gotMessage: "Thanks, we got your message.", gotMessageText: "We'll update your itinerary and send you a new version soon.", genericError: "Something went wrong. Please try again.",
  howWasDay: "How was your day?", thanksFeedback: "Thank you for your feedback!", happy: "We're so glad you enjoyed it. Your driver will hear about it too.",
  unhappy: "Thank you for telling us. Our team will read this and get back to you.", shareGoogle: "Share a review on Google", rateHint: "Tap the stars to rate your day.",
  commentPlaceholder: "What did you like? What could be better?", send: "Send",
  loadingDay: "Loading your day…", pickupToday: "Pickup today at {time}", driverSoon: "{place}. Your driver's location shows here once they set off.",
  finished: "Trip finished. We hope you had a wonderful day!", nowAt: "Now at {place}", onTheWay: "On the way to {place}", onTheWayBack: "On the way back", until: "Until about {time}",
  next: "Next", arriving: "arriving about", session: "session", behind: "Running about {n} min behind plan; your driver will adjust.", onPlan: "Running to plan.", backAt: "Back around {time}.",
  notFound: "Itinerary not found", notFoundText: "This link isn't valid or the itinerary isn't ready yet. Please check the link or contact us.",
  withdrawn: "This itinerary was withdrawn", withdrawnText: "Please contact us if you'd still like to travel; we'll gladly plan a new one.", home: "Waydidi home",
  departure: "Departure", returnLabel: "Return", galleryButton: "Gallery", closeLabel: "Close", seeMore: "See more", itineraryHeading: "Itinerary", departingFrom: "Departing from {place}", privateCarChip: "Private car", hoursChip: "{n}hr duration", daysChip: "{n} days", pickupAt: "Pickup at {time} from {place}",
  accPickup: "Pick-up & meet-up information", accBefore: "Before you book", accTerms: "Terms & Conditions", accHow: "How to use", priceHeld: "This price is held for {n} days.",
  howStep1: "Check your plan, then tap Accept and pay, or ask for a change.", howStep2: "Your confirmation arrives by email.", howStep3: "On the day, open this page to follow your driver and the next stop live.",
  sectionsNav: "Trip sections", tabBooking: "Booking", tabExpect: "What to expect", departureType: "Departure type: {type}", freeCancelNotice: "Free cancellation ({hours} hours notice)", viewMaps: "View maps", mapsTitle: "Route map", expectIntro: "A private day with your own car and driver, picking you up at {place}.", visitPlace: "Visit {place}", tabIncludes: "Includes/Excludes", timeCol: "Time", placesCol: "Attractions",
  galleryLabel: "Photos of your trip", photoOf: "Photo {n} of {total}", prevPhoto: "Previous photo", nextPhoto: "Next photo", stopsCount: "{n} stops", stopCount: "1 stop",
  highlights: "Highlights", included: "Included", notIncluded: "Not included", hotelTransfer: "Pickup and drop-off at your hotel",   ticketsAt: "Entrance tickets: {places}", feeAt: "Entrance fee at {place}, paid on the day", totalFor: "Total for your group",
  emailSentKicker: "Your private day trip", emailSentTitle: "Your itinerary: {title}", emailSentIntro: "Hi {name}, here is your trip planned stop by stop, with times, a map and what to bring. Have a look, ask for any change, or accept and pay when you're happy.",
  emailDate: "Date", emailPickup: "Pickup", emailTotal: "Total", emailView: "View my itinerary", emailHold: "Times are estimates and may change with traffic. This price is held for {n} days.",
  thanksKicker: "Thank you for travelling with Waydidi", thanksTitle: "How was your day, {name}?", thanksIntro: "We hope you loved {places}. It takes 20 seconds to tell us how the day went, and it helps us and your driver a lot.",
  thanksTrip: "Trip", thanksRef: "Reference", thanksCta: "Rate your day", thanksFooter: "You're getting this one-time email because you booked this trip with Waydidi.", andMore: " and more", traveller2: "traveller",
};
export type TripWords = typeof en;

const th: TripWords = {
  privateTrip: "ทริปส่วนตัวของคุณ", multiDay: "ทริปส่วนตัว {n} วันของคุณ", preparedBy: "จัดโดย {agency} ร่วมกับ Waydidi",
  pickup: "รับ {time}", backAround: "กลับถึงประมาณ {time}", travellers: "ผู้เดินทาง {n} คน", traveller: "ผู้เดินทาง 1 คน",
  paidTitle: "จองและชำระเงินแล้ว", paidText: "การยืนยันอยู่ในอีเมลของคุณ ในวันเดินทางติดตามคนขับและจุดถัดไปได้แบบเรียลไทม์", openYourDay: "เปิด “วันของคุณ”",
  updating: "เรากำลังปรับแผนการเดินทางของคุณ", updatingText: "ขอบคุณสำหรับคำขอ เราจะส่งเวอร์ชันใหม่ให้เร็วๆ นี้ และหน้านี้จะแสดงเวอร์ชันล่าสุด",
  yourDay: "วันของคุณ", day: "วันที่ {n}", hotelPickup: "รับที่โรงแรม", backAtHotel: "กลับถึงโรงแรม",
  open: "เปิด {hours}", sessionCheckIn: "รอบ {time}: เช็กอินก่อน {checkIn}", timesNote: "เวลาเป็นค่าประมาณและอาจเปลี่ยนตามสภาพการจราจร คนขับอาจปรับเส้นทางตามสภาพอากาศหรือสถานการณ์",
  whatToBring: "สิ่งที่ควรเตรียม", notes: "หมายเหตุ", price: "ราคา", transport: "รถส่วนตัว คนขับ น้ำมัน และค่าทางด่วน", tickets: "รวมค่าตั๋ว", discount: "ส่วนลด", total: "รวมทั้งหมด",
  plusFees: "บวกค่าเข้าชมประมาณ {amount} ชำระหน้างาน", expired: "ราคานี้หมดอายุแล้ว กรุณาติดต่อเราเพื่อยืนยันราคาอีกครั้ง",
  downloadPdf: "ดาวน์โหลดแผนการเดินทาง (PDF)", refLine: "หมายเลข {ref} · เวอร์ชัน {v} ยกเลิกฟรีถึง {hours} ชั่วโมงก่อนเวลารับ ดู", policy: "นโยบายการยกเลิก",
  acceptPay: "ยืนยันและชำระ {amount}", askChange: "ขอแก้ไข", yourDetails: "ข้อมูลของคุณ", fullName: "ชื่อ-นามสกุล", email: "อีเมล", phone: "โทรศัพท์ (WhatsApp หรือ LINE)",
  acceptTerms: "ฉันยอมรับ{terms}และ{policy}", terms: "ข้อกำหนด", paySecure: "ชำระ {amount} อย่างปลอดภัย", back: "ย้อนกลับ",
  changeQ: "ต้องการแก้ไขอะไร?", changePlaceholder: "เช่น เริ่ม 9:00 และเพิ่มจุดแวะชายหาดได้ไหม", sendRequest: "ส่งคำขอ",
  gotMessage: "ขอบคุณ เราได้รับข้อความแล้ว", gotMessageText: "เราจะปรับแผนและส่งเวอร์ชันใหม่ให้เร็วๆ นี้", genericError: "เกิดข้อผิดพลาด กรุณาลองอีกครั้ง",
  howWasDay: "วันนี้เป็นอย่างไรบ้าง?", thanksFeedback: "ขอบคุณสำหรับความคิดเห็น!", happy: "ดีใจที่คุณประทับใจ เราจะส่งต่อคำชมให้คนขับด้วย",
  unhappy: "ขอบคุณที่บอกเรา ทีมงานจะอ่านและติดต่อกลับ", shareGoogle: "รีวิวบน Google", rateHint: "แตะดาวเพื่อให้คะแนน",
  commentPlaceholder: "ชอบอะไร และมีอะไรที่ควรปรับปรุง?", send: "ส่ง",
  loadingDay: "กำลังโหลด…", pickupToday: "รับวันนี้เวลา {time}", driverSoon: "{place} ตำแหน่งคนขับจะแสดงเมื่อออกเดินทาง",
  finished: "จบทริปแล้ว หวังว่าคุณจะมีวันที่ยอดเยี่ยม!", nowAt: "ตอนนี้อยู่ที่ {place}", onTheWay: "กำลังไป {place}", onTheWayBack: "กำลังเดินทางกลับ", until: "ถึงประมาณ {time}",
  next: "ถัดไป", arriving: "ถึงประมาณ", session: "รอบ", behind: "ช้ากว่าแผนประมาณ {n} นาที คนขับจะปรับเส้นทาง", onPlan: "เป็นไปตามแผน", backAt: "กลับถึงประมาณ {time}",
  notFound: "ไม่พบแผนการเดินทาง", notFoundText: "ลิงก์ไม่ถูกต้องหรือแผนยังไม่พร้อม กรุณาตรวจสอบลิงก์หรือติดต่อเรา",
  withdrawn: "แผนการเดินทางนี้ถูกยกเลิก", withdrawnText: "หากยังต้องการเดินทาง ติดต่อเราได้เลย เรายินดีวางแผนให้ใหม่", home: "หน้าแรก Waydidi",
  departure: "ออกเดินทาง", returnLabel: "เดินทางกลับ", galleryButton: "แกลเลอรี", closeLabel: "ปิด", seeMore: "ดูเพิ่มเติม", itineraryHeading: "แผนการเดินทาง", departingFrom: "ออกเดินทางจาก {place}", privateCarChip: "รถส่วนตัว", hoursChip: "ระยะเวลา {n} ชม.", daysChip: "{n} วัน", pickupAt: "รับเวลา {time} ที่ {place}",
  accPickup: "ข้อมูลการรับและจุดนัดพบ", accBefore: "ก่อนจอง", accTerms: "ข้อกำหนดและเงื่อนไข", accHow: "วิธีใช้งาน", priceHeld: "ราคานี้ยืนยันไว้ {n} วัน",
  howStep1: "ตรวจสอบแผนการเดินทาง แล้วกดยอมรับและชำระเงิน หรือขอเปลี่ยนแปลง", howStep2: "คุณจะได้รับอีเมลยืนยันการจอง", howStep3: "ในวันเดินทาง เปิดหน้านี้เพื่อติดตามคนขับและจุดแวะถัดไปแบบสด",
  sectionsNav: "ส่วนต่างๆ ของทริป", tabBooking: "การจอง", tabExpect: "สิ่งที่จะได้พบ", departureType: "ประเภทการออกเดินทาง: {type}", freeCancelNotice: "ยกเลิกฟรี (แจ้งล่วงหน้า {hours} ชั่วโมง)", viewMaps: "ดูแผนที่", mapsTitle: "แผนที่เส้นทาง", expectIntro: "ทริปส่วนตัวพร้อมรถและคนขับของคุณเอง รับคุณที่ {place}", visitPlace: "เที่ยวชม {place}", tabIncludes: "รวม/ไม่รวม", timeCol: "เวลา", placesCol: "สถานที่ท่องเที่ยว",
  galleryLabel: "รูปภาพทริปของคุณ", photoOf: "รูปที่ {n} จาก {total}", prevPhoto: "รูปก่อนหน้า", nextPhoto: "รูปถัดไป", stopsCount: "{n} จุดแวะ", stopCount: "1 จุดแวะ",
  highlights: "ไฮไลต์", included: "รวมในราคา", notIncluded: "ไม่รวมในราคา", hotelTransfer: "รับและส่งที่โรงแรมของคุณ",   ticketsAt: "ค่าเข้าชม: {places}", feeAt: "ค่าเข้าชม {place} ชำระในวันเดินทาง", totalFor: "ราคารวมสำหรับกลุ่มของคุณ",
  emailSentKicker: "ทริปส่วนตัวของคุณ", emailSentTitle: "แผนการเดินทาง: {title}", emailSentIntro: "สวัสดีคุณ {name} นี่คือแผนการเดินทางแบบทีละจุด พร้อมเวลา แผนที่ และสิ่งที่ควรเตรียม ดูแผน ขอแก้ไข หรือยืนยันและชำระเงินได้เลย",
  emailDate: "วันที่", emailPickup: "เวลารับ", emailTotal: "รวม", emailView: "ดูแผนการเดินทาง", emailHold: "เวลาเป็นค่าประมาณ ราคานี้คงไว้ {n} วัน",
  thanksKicker: "ขอบคุณที่เดินทางกับ Waydidi", thanksTitle: "วันนี้เป็นอย่างไรบ้าง คุณ {name}?", thanksIntro: "หวังว่าคุณจะชอบ {places} ใช้เวลาเพียง 20 วินาทีบอกเราว่าวันนี้เป็นอย่างไร ช่วยเราและคนขับได้มาก",
  thanksTrip: "ทริป", thanksRef: "หมายเลข", thanksCta: "ให้คะแนน", thanksFooter: "คุณได้รับอีเมลนี้ครั้งเดียวเพราะจองทริปนี้กับ Waydidi", andMore: " และอื่นๆ", traveller2: "ผู้เดินทาง",
};

const zh: TripWords = {
  privateTrip: "您的私人一日游", multiDay: "您的 {n} 天私人行程", preparedBy: "{agency} 与 Waydidi 为您安排",
  pickup: "{time} 接送", backAround: "约 {time} 返回", travellers: "{n} 位旅客", traveller: "1 位旅客",
  paidTitle: "已预订并付款", paidText: "确认信已发送到您的邮箱。出行当天可实时查看司机位置和下一站。", openYourDay: "打开“今日行程”",
  updating: "我们正在更新您的行程", updatingText: "感谢您的要求。我们会尽快发送新版本，本页面将显示最新行程。",
  yourDay: "今日行程", day: "第 {n} 天", hotelPickup: "酒店接送", backAtHotel: "返回酒店",
  open: "开放 {hours}", sessionCheckIn: "{time} 场次：请于 {checkIn} 前签到", timesNote: "时间为预估，可能因交通而变化。司机可能根据天气或当地情况调整路线。",
  whatToBring: "携带物品", notes: "备注", price: "价格", transport: "私人专车、司机、油费及过路费", tickets: "含门票", discount: "折扣", total: "合计",
  plusFees: "另需现场支付约 {amount} 门票。", expired: "此报价已过期，请联系我们重新确认。",
  downloadPdf: "下载行程 (PDF)", refLine: "编号 {ref} · 第 {v} 版。接送前 {hours} 小时可免费取消，详见", policy: "取消政策",
  acceptPay: "确认并支付 {amount}", askChange: "申请修改", yourDetails: "您的信息", fullName: "姓名", email: "电子邮箱", phone: "电话（WhatsApp 或 LINE）",
  acceptTerms: "我接受{terms}和{policy}。", terms: "条款", paySecure: "安全支付 {amount}", back: "返回",
  changeQ: "您想修改什么？", changePlaceholder: "例如：能否 9:00 出发并增加海滩停留？", sendRequest: "发送请求",
  gotMessage: "谢谢，我们已收到您的留言。", gotMessageText: "我们会更新行程并尽快发送新版本。", genericError: "出错了，请重试。",
  howWasDay: "今天玩得怎么样？", thanksFeedback: "感谢您的反馈！", happy: "很高兴您玩得开心，我们也会转告您的司机。",
  unhappy: "感谢告知，我们的团队会阅读并与您联系。", shareGoogle: "在 Google 上评价", rateHint: "点击星星为这一天评分。",
  commentPlaceholder: "您喜欢什么？哪些可以做得更好？", send: "发送",
  loadingDay: "正在加载…", pickupToday: "今天 {time} 接送", driverSoon: "{place}。司机出发后将在此显示位置。",
  finished: "行程已结束，希望您度过了美好的一天！", nowAt: "当前在 {place}", onTheWay: "前往 {place}", onTheWayBack: "返程中", until: "约至 {time}",
  next: "下一站", arriving: "预计到达", session: "场次", behind: "比计划晚约 {n} 分钟，司机会调整。", onPlan: "按计划进行。", backAt: "约 {time} 返回。",
  notFound: "未找到行程", notFoundText: "链接无效或行程尚未准备好，请检查链接或联系我们。",
  withdrawn: "此行程已撤回", withdrawnText: "如仍想出行，请联系我们，我们很乐意重新安排。", home: "Waydidi 首页",
  departure: "出发", returnLabel: "返回", galleryButton: "相册", closeLabel: "关闭", seeMore: "查看更多", itineraryHeading: "行程安排", departingFrom: "出发地：{place}", privateCarChip: "私人专车", hoursChip: "{n} 小时", daysChip: "{n} 天", pickupAt: "{time} 在 {place} 接您",
  accPickup: "接送及集合信息", accBefore: "预订须知", accTerms: "条款和条件", accHow: "使用方法", priceHeld: "此价格保留 {n} 天。",
  howStep1: "查看行程，然后点击接受并付款，或申请修改。", howStep2: "确认信息将通过电子邮件发送给您。", howStep3: "出行当天，打开此页面即可实时查看司机位置和下一站。",
  sectionsNav: "行程栏目", tabBooking: "预订", tabExpect: "行程体验", departureType: "出发方式：{type}", freeCancelNotice: "免费取消（需提前 {hours} 小时通知）", viewMaps: "查看地图", mapsTitle: "路线地图", expectIntro: "专属私人包车与司机，在 {place} 接您。", visitPlace: "游览 {place}", tabIncludes: "包含/不包含", timeCol: "时间", placesCol: "景点",
  galleryLabel: "行程照片", photoOf: "第 {n} 张，共 {total} 张", prevPhoto: "上一张", nextPhoto: "下一张", stopsCount: "{n} 个景点", stopCount: "1 个景点",
  highlights: "亮点", included: "费用包含", notIncluded: "费用不包含", hotelTransfer: "酒店接送",   ticketsAt: "门票：{places}", feeAt: "{place}门票，当天支付", totalFor: "全团总价",
  emailSentKicker: "您的私人一日游", emailSentTitle: "您的行程：{title}", emailSentIntro: "{name} 您好，这是为您逐站规划的行程，包含时间、地图和携带物品。请查看、申请修改，或满意后确认并付款。",
  emailDate: "日期", emailPickup: "接送", emailTotal: "合计", emailView: "查看我的行程", emailHold: "时间为预估。此报价保留 {n} 天。",
  thanksKicker: "感谢您选择 Waydidi", thanksTitle: "{name}，今天玩得怎么样？", thanksIntro: "希望您喜欢 {places}。只需 20 秒告诉我们这一天的感受，这对我们和司机都很有帮助。",
  thanksTrip: "行程", thanksRef: "编号", thanksCta: "为这一天评分", thanksFooter: "您收到这封一次性邮件，是因为您在 Waydidi 预订了此行程。", andMore: " 等", traveller2: "旅客",
};

const ALL: Record<TripLang, TripWords> = { en, th, zh };

export function tripWords(lang: string | null | undefined): TripWords { return ALL[(lang as TripLang) in ALL ? (lang as TripLang) : "en"]; }

/** Fills {placeholders}. */
export function fill(text: string, vars: Record<string, string | number> = {}) {
  return text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}

export const dateLocale = (lang: string | null | undefined) => (lang === "th" ? "th-TH" : lang === "zh" ? "zh-CN" : "en-GB");
