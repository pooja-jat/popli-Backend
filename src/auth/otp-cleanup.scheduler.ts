import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuthService } from './auth.service';

@Injectable()
export class OtpCleanupScheduler {
  constructor(private readonly authService: AuthService) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async handleCleanup() {
    await this.authService.cleanupExpiredOtps();
  }
}