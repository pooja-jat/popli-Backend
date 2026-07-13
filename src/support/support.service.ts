import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTicketDto } from './dto/support.dto';
import { SupportGateway } from './support.gateway';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class SupportService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => SupportGateway)) private gateway: SupportGateway,
    private notificationsService: NotificationsService,
  ) {}

  async createTicket(userId: string, dto: CreateTicketDto) {
    return this.prisma.supportTicket.create({
      data: {
        ...dto,
        creatorId: userId,
      },
    });
  }

async getMyTickets(userId: string) {
    return this.prisma.supportTicket.findMany({
      where: { creatorId: userId },
      orderBy: { createdAt: 'desc' },
    });
  }
async sendMessage(ticketId: string, senderId: string, message: string, role: string) {
    const msg = await this.prisma.ticketMessage.create({
      data: { ticketId, senderId, message, senderRole: role },
      include: {
        sender: { select: { id: true, name: true, username: true, avatar: true } },
      },
    });
    this.gateway.emitNewMessage(ticketId, msg);

    // Push to the other party
    if (role === 'ADMIN') {
      const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
      if (ticket) {
        await this.notificationsService.createAndPush(
          {
            userId: ticket.creatorId,
            type: 'SYSTEM',
            title: 'Support Reply',
            body: `Admin replied to your support ticket.`,
          },
          'Support Reply',
          `Admin replied to your support ticket.`,
        ).catch(() => {});
      }
    } else {
      // User sent message — notify admin (optional, skip if no admin userId available)
    }

    return msg;
  }
async getMessages(ticketId: string, requesterId: string, requesterRole: string) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId },
    });
    if (!ticket) throw new Error('Ticket not found');
    if (requesterRole !== 'ADMIN' && ticket.creatorId !== requesterId) throw new Error('Unauthorized');

    return this.prisma.ticketMessage.findMany({
      where: { ticketId },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: { select: { id: true, name: true, username: true, avatar: true } },
      },
    });
  }

async resolveTicket(ticketId: string) {
    const ticket = await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: 'RESOLVED' },
    });

    await this.notificationsService.createAndPush(
      {
        userId: ticket.creatorId,
        type: 'SYSTEM',
        title: 'Ticket Resolved',
        body: 'Your support ticket has been resolved. We hope your issue is fixed!',
      },
      'Ticket Resolved',
      'Your support ticket has been resolved. We hope your issue is fixed!',
    ).catch(() => {});

    return ticket;
  }

  async getAllTickets() {
    return this.prisma.supportTicket.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        creator: { select: { id: true, name: true, username: true, avatar: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
  }
}