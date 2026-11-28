export const FOLLOWUP_INTERVAL_MS = 60 * 60 * 1000;

export function quoteFollowupStep(sentAt: string, now: number): 1 | 2 | null {
  const age = now - Date.parse(sentAt);
  if (age >= FOLLOWUP_INTERVAL_MS && age < 2 * FOLLOWUP_INTERVAL_MS) return 1;
  if (age >= 2 * FOLLOWUP_INTERVAL_MS && age < 3 * FOLLOWUP_INTERVAL_MS) return 2;
  return null;
}

const languages = { en: "en_US", th: "th", zh: "zh_CN" };

export function followupTemplate(name: string | undefined, locale: keyof typeof languages) {
  if (!name || !/^[a-z0-9_]{1,128}$/.test(name)) return null;
  return { name, language: languages[locale] };
}
