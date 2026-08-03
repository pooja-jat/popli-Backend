import { Module } from '@nestjs/common';
import { ReelsService } from './reels.service';
import { ReelsController } from './reels.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ChatModule } from '../chat/chat.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { HashtagsModule } from '../hashtags/hashtags.module';
import { ChallengesModule } from '../challenges/challenges.module';
import { QueueModule } from '../queue/queue.module';
import { VideoModule } from '../video/video.module';

@Module({
  imports: [
    PrismaModule,
    ChatModule,
    NotificationsModule,
    HashtagsModule,
    ChallengesModule,
QueueModule,
    VideoModule,
  ],
  controllers: [ReelsController],
  providers: [ReelsService],
  exports: [ReelsService],
})
export class ReelsModule {}
