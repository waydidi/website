import type { PaymentProviderAdapter } from "@/lib/payments/types";

function unavailable(): never { throw new Error("PAYSO_NOT_CONFIGURED"); }

export const paysoPaymentProvider: PaymentProviderAdapter = {
  name: "payso",
  enabled: false,
  async createPayment() { return unavailable(); },
  async retrievePayment() { return unavailable(); },
  async refundPayment() { return unavailable(); },
  async verifyWebhook() { return unavailable(); },
};
