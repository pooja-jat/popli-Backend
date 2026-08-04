import { Module } from '@nestjs/common';
import { EarningsService } from './earnings.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlatformModule } from '../platform/platform.module';

@Module({
  imports: [PrismaModule, NotificationsModule, PlatformModule],
  providers: [EarningsService],
  exports: [EarningsService],
})
export class EarningsModule {}