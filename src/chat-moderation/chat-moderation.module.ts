import { Module } from '@nestjs/common';
import { ChatModerationController } from './chat-moderation.controller';
import { ChatModerationService } from './chat-moderation.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ChatModerationController],
  providers: [ChatModerationService],
  exports: [ChatModerationService],
})
export class ChatModerationModule {}