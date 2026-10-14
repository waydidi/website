// What the driver is told when the phone's live camera can't be opened (pure, tested in tests/camera-errors.test.mjs).
// Whatever the reason, the driver can still take the photo with the phone's own camera app.

/** Apps that open links in their own browser (Telegram, LINE, Facebook, Instagram, WeChat, Android WebView). */
export const isInAppBrowser = (userAgent: string) => /Telegram|\bLine\/|FBAN|FBAV|Instagram|MicroMessenger|; wv\)/i.test(userAgent);

const SETTINGS = "ในการตั้งค่าโทรศัพท์ (การตั้งค่า › เบราว์เซอร์ › กล้อง)";

export function cameraProblem(errorName: string, inApp: boolean): string {
  if (errorName === "NotAllowedError" || errorName === "SecurityError" || errorName === "PermissionDeniedError") {
    return inApp
      ? `กล้องถูกปิดไว้ ลิงก์นี้เปิดอยู่ในแอปอื่น (เช่น Telegram หรือ LINE) กดเมนู ⋮ แล้วเลือก «เปิดใน Chrome» หรือเปิดสิทธิ์กล้องให้แอปนั้น ${SETTINGS} หรือกดถ่ายด้วยแอปกล้องของโทรศัพท์ด้านล่าง`
      : `กล้องถูกปิดไว้ เปิดสิทธิ์กล้องให้ waydidi.com ${SETTINGS} แล้วกดลองอีกครั้ง หรือกดถ่ายด้วยแอปกล้องของโทรศัพท์ด้านล่าง`;
  }
  if (errorName === "NotFoundError" || errorName === "DevicesNotFoundError") return "ไม่พบกล้องในโทรศัพท์เครื่องนี้ กดถ่ายด้วยแอปกล้องของโทรศัพท์ด้านล่าง";
  if (errorName === "NotReadableError" || errorName === "TrackStartError" || errorName === "AbortError") return "เปิดกล้องไม่ได้ อาจมีแอปอื่นใช้กล้องอยู่ ปิดแอปอื่นแล้วลองอีกครั้ง หรือกดถ่ายด้วยแอปกล้องของโทรศัพท์ด้านล่าง";
  return "เปิดกล้องในหน้านี้ไม่ได้ กดถ่ายด้วยแอปกล้องของโทรศัพท์ด้านล่าง";
}
