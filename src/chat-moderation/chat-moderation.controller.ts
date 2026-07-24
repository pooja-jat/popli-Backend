import { Controller, Get, Post, Patch, Param, Body, Query, Req, UseGuards } from '@nestjs/common';
import { ChatModerationService } from './chat-moderation.service';
import { GetFlagsQueryDto, ModerationActionDto, FlagMessageDto } from './dto/chat-moderation.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('admin/chat-moderation')
@UseGuards(JwtAuthGuard)
export class ChatModerationController {
  constructor(private readonly service: ChatModerationService) {}

  @Get('stats')
  getStats() {
    return this.service.getStats();
  }

  @Get('flags')
  getFlags(@Query() query: GetFlagsQueryDto) {
    return this.service.getFlags(query);
  }

  @Get('flags/:id')
  getFlagById(@Param('id') id: string) {
    return this.service.getFlagById(id);
  }

  @Get('conversation/:chatId')
  getConversation(@Param('chatId') chatId: string) {
    return this.service.getConversation(chatId);
  }

  @Post('flags/:id/action')
  performAction(@Param('id') id: string, @Body() dto: ModerationActionDto, @Req() req: any) {
    const adminId = req.user?.id ?? 'system';
    return this.service.performAction(id, adminId, dto);
  }

  @Post('scan/:messageId')
  scanMessage(@Param('messageId') messageId: string) {
    return this.service.scanAndFlagMessage(messageId);
  }
}