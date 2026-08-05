import { Injectable, Logger } from '@nestjs/common';
import { PayoutProvider, PayoutRequest, PayoutResult } from './payout-provider.interface';
import axios from 'axios';

@Injectable()
export class RazorpayPayoutProvider implements PayoutProvider {
  private readonly logger = new Logger(RazorpayPayoutProvider.name);

  private get credentials() {
    return {
      keyId: process.env.RAZORPAY_KEY_ID!,
      keySecret: process.env.RAZORPAY_KEY_SECRET!,
    };
  }

  private get authHeader() {
    const { keyId, keySecret } = this.credentials;
    return Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  }

  async initiatePayout(request: PayoutRequest): Promise<PayoutResult> {
    try {
      const amountPaise = Math.round(request.amount * 100);

      const payload: Record<string, any> = {
        account_number: process.env.RAZORPAY_PAYOUT_ACCOUNT_NUMBER!,
        amount: amountPaise,
        currency: request.currency || 'INR',
        mode: request.upiId ? 'UPI' : 'NEFT',
        purpose: 'payout',
        narration: request.narration,
        reference_id: request.idempotencyKey,
        fund_account: {
          account_type: request.upiId ? 'vpa' : 'bank_account',
          contact: {
            name: request.recipientName,
            type: 'self',
          },
        },
      };

      if (request.upiId) {
        payload.fund_account.vpa = { address: request.upiId };
      } else {
        payload.fund_account.bank_account = {
          name: request.recipientName,
          ifsc: request.ifscCode,
          account_number: request.bankAccount,
        };
      }

      const response = await axios.post(
        'https://api.razorpay.com/v1/payouts',
        payload,
        {
          headers: {
            Authorization: `Basic ${this.authHeader}`,
            'Content-Type': 'application/json',
            'X-Payout-Idempotency': request.idempotencyKey,
          },
          timeout: 30000,
        },
      );

      const data = response.data;
      this.logger.log(`Razorpay payout initiated: ${data.id} | status: ${data.status}`);

      return {
        success: true,
        payoutId: data.id,
        status: data.status,
        providerResponse: data,
      };
    } catch (err: any) {
      const errorData = err?.response?.data || {};
      this.logger.error(`Razorpay payout failed: ${JSON.stringify(errorData)}`);
      return {
        success: false,
        status: 'failed',
        providerResponse: errorData,
        errorMessage: errorData?.error?.description || err.message,
      };
    }
  }

  async fetchPayoutStatus(payoutId: string): Promise<PayoutResult> {
    try {
      const response = await axios.get(
        `https://api.razorpay.com/v1/payouts/${payoutId}`,
        {
          headers: { Authorization: `Basic ${this.authHeader}` },
          timeout: 15000,
        },
      );
      const data = response.data;
      return {
        success: true,
        payoutId: data.id,
        status: data.status,
        providerResponse: data,
      };
    } catch (err: any) {
      const errorData = err?.response?.data || {};
      return {
        success: false,
        status: 'failed',
        providerResponse: errorData,
        errorMessage: errorData?.error?.description || err.message,
      };
    }
  }
}