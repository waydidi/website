export const THAI_BANKS = [
  { code: "KBANK", name: "Kasikornbank", thai: "ธนาคารกสิกรไทย", color: "#138F4A" },
  { code: "SCB", name: "Siam Commercial Bank", thai: "ธนาคารไทยพาณิชย์", color: "#4E2A84" },
  { code: "KTB", name: "Krungthai Bank", thai: "ธนาคารกรุงไทย", color: "#19A9E5" },
  { code: "BBL", name: "Bangkok Bank", thai: "ธนาคารกรุงเทพ", color: "#1D3F8F" },
  { code: "BAY", name: "Krungsri", thai: "ธนาคารกรุงศรีอยุธยา", color: "#F3C400" },
  { code: "TTB", name: "TMBThanachart Bank", thai: "ธนาคารทหารไทยธนชาต", color: "#F36C21" },
  { code: "GSB", name: "Government Savings Bank", thai: "ธนาคารออมสิน", color: "#E94B91" },
  { code: "BAAC", name: "BAAC", thai: "ธ.ก.ส.", color: "#1A7B42" },
  { code: "KKP", name: "Kiatnakin Phatra", thai: "ธนาคารเกียรตินาคินภัทร", color: "#6B3D91" },
  { code: "CIMB", name: "CIMB Thai", thai: "ธนาคารซีไอเอ็มบี ไทย", color: "#D71920" },
  { code: "UOB", name: "UOB Thailand", thai: "ธนาคารยูโอบี", color: "#134A9E" },
  { code: "GHB", name: "Government Housing Bank", thai: "ธนาคารอาคารสงเคราะห์", color: "#F37021" },
] as const;

export function thaiBank(code: string) {
  return THAI_BANKS.find((bank) => bank.code === code);
}
