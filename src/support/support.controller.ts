import { Controller, Get, Post, Body, UseGuards, Req, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SupportService } from './support.service';
import { CreateTicketDto } from './dto/support.dto';

@ApiTags('support')
@Controller('support')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Get()
  @ApiOperation({ summary: 'Get all user tickets' })
  getMyTickets(@Req() req: any) {
    return this.supportService.getMyTickets(req.user.id);
  }

@Post()
  @ApiOperation({ summary: 'Create a new support ticket' })
  createTicket(@Req() req: any, @Body() dto: CreateTicketDto) {
    return this.supportService.createTicket(req.user.id, dto);
  }

  @Post(':id/message')
  sendMessage(@Req() req: any, @Param('id') ticketId: string, @Body('message') message: string) {
    return this.supportService.sendMessage(ticketId, req.user.id, message, req.user.role);
  }

@Get('all')
  getAllTickets(@Req() req: any) {
    if (req.user.role !== 'ADMIN') throw new Error('Unauthorized');
    return this.supportService.getAllTickets();
  }

  @Post(':id/resolve')
  resolveTicket(@Req() req: any, @Param('id') ticketId: string) {
    if (req.user.role !== 'ADMIN') throw new Error('Unauthorized');
    return this.supportService.resolveTicket(ticketId);
  }

  @Get(':id/messages')
  getMessages(@Req() req: any, @Param('id') ticketId: string) {
    return this.supportService.getMessages(ticketId, req.user.id, req.user.role);
  }
}
