import { Module, Global } from '@nestjs/common';
import { CashfreePayoutProvider } from './cashfree-payout.provider';

@Global()
@Module({
  providers: [
    {
      provide: 'PAYOUT_PROVIDER',
      useClass: CashfreePayoutProvider,
    },
  ],
  exports: ['PAYOUT_PROVIDER'],
})
export class PayoutModule {}