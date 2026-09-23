import type { PaymentProvider } from "@/lib/payment-model";
import type { PaymentProviderAdapter } from "@/lib/payments/types";
import { cashPaymentProvider } from "@/lib/payments/cash-provider";
import { paysoPaymentProvider } from "@/lib/payments/payso-provider";
import { stripePaymentProvider } from "@/lib/payments/stripe-provider";

const providers: Record<PaymentProvider, PaymentProviderAdapter> = {
  stripe: stripePaymentProvider,
  payso: paysoPaymentProvider,
  cash: cashPaymentProvider,
};

export function paymentProviderFor(provider: PaymentProvider) {
  return providers[provider];
}
