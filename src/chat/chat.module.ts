import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { ChatModerationModule } from '../chat-moderation/chat-moderation.module';

@Module({
  imports: [
    JwtModule.register({ secret: process.env.JWT_SECRET }),
    ChatModerationModule,
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway],
  exports: [ChatService, ChatGateway],
})
export class ChatModule {}