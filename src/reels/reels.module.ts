import { Module } from '@nestjs/common';
import { ReelsService } from './reels.service';
import { ReelsController } from './reels.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ChatModule } from '../chat/chat.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { HashtagsModule } from '../hashtags/hashtags.module';
import { ChallengesModule } from '../challenges/challenges.module';
import { VideoModule } from '../video/video.module';
import { PlatformModule } from '../platform/platform.module';

@Module({
imports: [
    PrismaModule,
    ChatModule,
    NotificationsModule,
    HashtagsModule,
    ChallengesModule,
    VideoModule,
    PlatformModule,
  ],
  controllers: [ReelsController],
  providers: [ReelsService],
  exports: [ReelsService],
})
export class ReelsModule {}