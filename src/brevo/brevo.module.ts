import { Module } from '@nestjs/common';
import { BrevoService } from './brevo.service';

@Module({
  providers: [BrevoService],
  exports: [BrevoService],
})
export class BrevoModule {}