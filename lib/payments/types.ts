import type { UnifiedPaymentStatus, PaymentProvider } from "@/lib/payment-model";
import type { VehicleId } from "@/lib/vehicles";

export type ProviderPaymentSession = {
  provider: PaymentProvider;
  sessionId?: string;
  transactionId?: string;
  status: UnifiedPaymentStatus;
  providerStatus?: string;
  checkoutUrl?: string | null;
  amountMinor?: number;
  currency?: string;
  bookingReference?: string;
};

export type CreateProviderPaymentInput = {
  reference: string;
  accessToken: string;
  customerEmail: string;
  vehicle: VehicleId;
  total: number;
  origin: string;
  idempotencyKey: string;
};

export type ProviderRefund = { id: string; status: string };
export type VerifiedProviderWebhook<T = unknown> = { id: string; type: string; payload: T };

export interface PaymentProviderAdapter {
  readonly name: PaymentProvider;
  readonly enabled: boolean;
  createPayment(input: CreateProviderPaymentInput): Promise<ProviderPaymentSession>;
  retrievePayment(sessionId: string): Promise<ProviderPaymentSession>;
  refundPayment(transactionId: string, reference: string): Promise<ProviderRefund>;
  verifyWebhook(rawBody: string, signature: string): Promise<VerifiedProviderWebhook>;
}
