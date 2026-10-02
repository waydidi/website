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
/** Provider-independent refund request. amountMinor is calculated by the server, never by the browser. */
export type ProviderRefundRequest = { paymentId: string; reference: string; amountMinor: number; reason: string; idempotencyKey: string };
export type VerifiedProviderWebhook<T = unknown> = { id: string; type: string; payload: T };

export interface PaymentProviderAdapter {
  readonly name: PaymentProvider;
  readonly enabled: boolean;
  createPayment(input: CreateProviderPaymentInput): Promise<ProviderPaymentSession>;
  retrievePayment(sessionId: string): Promise<ProviderPaymentSession>;
  refundPayment(request: ProviderRefundRequest): Promise<ProviderRefund>;
  /** Current provider status of a refund, for webhook-driven reconciliation. */
  retrieveRefund(refundId: string): Promise<ProviderRefund>;
  verifyWebhook(rawBody: string, signature: string): Promise<VerifiedProviderWebhook>;
}
