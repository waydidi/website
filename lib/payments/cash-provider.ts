import type { PaymentProviderAdapter } from "@/lib/payments/types";

function unsupported(): never { throw new Error("CASH_PROVIDER_OPERATION_UNSUPPORTED"); }

export const cashPaymentProvider: PaymentProviderAdapter = {
  name: "cash",
  enabled: true,
  async createPayment(input) {
    return { provider: "cash", status: "cash_due", providerStatus: "cash_due", amountMinor: input.total * 100, currency: "thb", bookingReference: input.reference };
  },
  async retrievePayment() { return unsupported(); },
  async refundPayment() { return unsupported(); },
  async verifyWebhook() { return unsupported(); },
};
