import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AdminPartnerService } from './admin-partner.service';
import { AdminPartnerController } from './admin-partner.controller';
import { PlatformJobsService } from './platform-jobs.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PayoutModule } from '../payout/payout.module';
import { RedisModule } from '../redis/redis.module';
import { KafkaModule } from '../kafka/kafka.module';

@Module({
  imports: [
    PrismaModule,
    PayoutModule,
    RedisModule,
    KafkaModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'fallback_secret',
      signOptions: { expiresIn: '1d' },
    }),
  ],
  controllers: [AdminController, AdminPartnerController],
  providers: [AdminService, AdminPartnerService, PlatformJobsService],
  exports: [AdminService, AdminPartnerService],
})
export class AdminModule {}