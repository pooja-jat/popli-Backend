import { Module, Global } from '@nestjs/common';
import { RazorpayPayoutProvider } from './razorpay-payout.provider';

@Global()
@Module({
  providers: [
    {
      provide: 'PAYOUT_PROVIDER',
      useClass: RazorpayPayoutProvider,
    },
  ],
  exports: ['PAYOUT_PROVIDER'],
})
export class PayoutModule {}