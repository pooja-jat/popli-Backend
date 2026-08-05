export interface PayoutRequest {
  withdrawalId: string;
  idempotencyKey: string;
  amount: number;
  currency: string;
  recipientName: string;
  upiId?: string;
  bankAccount?: string;
  ifscCode?: string;
  narration: string;
}

export interface PayoutResult {
  success: boolean;
  payoutId?: string;
  status: string;
  providerResponse: Record<string, any>;
  errorMessage?: string;
}

export interface PayoutProvider {
  initiatePayout(request: PayoutRequest): Promise<PayoutResult>;
  fetchPayoutStatus(payoutId: string): Promise<PayoutResult>;
}