import { Module } from '@nestjs/common';
import { StoriesService } from './stories.service';
import { StoriesController } from './stories.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { ChatModule } from '../chat/chat.module';
import { VideoModule } from '../video/video.module';

@Module({
  imports: [NotificationsModule, ChatModule, VideoModule],
  controllers: [StoriesController],
  providers: [StoriesService],
  exports: [StoriesService],
})
export class StoriesModule {}