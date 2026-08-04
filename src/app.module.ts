import { Module } from '@nestjs/common';
import { SecurityModule } from './security/security.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { CacheModule } from '@nestjs/cache-manager';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ReelsModule } from './reels/reels.module';
import { StoriesModule } from './stories/stories.module';
import { ChatModule } from './chat/chat.module';
import { SocialModule } from './social/social.module';
import { NotificationsModule } from './notifications/notifications.module';
import { WalletModule } from './wallet/wallet.module';
import { GiftsModule } from './gifts/gifts.module';
import { KycModule } from './kyc/kyc.module';
import { SupportModule } from './support/support.module';
import { AdminModule } from './admin/admin.module';
import { ChatModerationModule } from './chat-moderation/chat-moderation.module';
import { FeedModule } from './feed/feed.module';
import { UploadModule } from './upload/upload.module';
import { VideoModule } from './video/video.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { SearchModule } from './search/search.module';
import { InterestsModule } from './interests/interests.module';
import { ChallengesModule } from './challenges/challenges.module';
import { HashtagsModule } from './hashtags/hashtags.module';
import { SystemModule } from './system/system.module';
import { CoinPackagesModule } from './coin-packages/coin-packages.module';
import { QueueModule } from './queue/queue.module';
import { RedisModule } from './redis/redis.module';
import { KafkaModule } from './kafka/kafka.module';
import { PlatformModule } from './platform/platform.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    CacheModule.register({ isGlobal: true }),
    ScheduleModule.forRoot(),
    RedisModule,
    KafkaModule,
    PlatformModule,
    QueueModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    ReelsModule,
    StoriesModule,
    ChatModule,
    SocialModule,
    NotificationsModule,
    WalletModule,
    GiftsModule,
    KycModule,
    SupportModule,
    AdminModule,
    ChatModerationModule,
    FeedModule,
    UploadModule,
    VideoModule,
    AnalyticsModule,
    SearchModule,
    InterestsModule,
    ChallengesModule,
    HashtagsModule,
    SystemModule,
    CoinPackagesModule,
    SecurityModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}