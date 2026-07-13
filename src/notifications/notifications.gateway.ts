import { Injectable, forwardRef, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChatGateway } from '../chat/chat.gateway';
import { NotificationsService } from './notifications.service';

@Injectable()
export class NotificationsGateway {
  constructor(
    private prisma: PrismaService,
    private chatGateway: ChatGateway,
    @Inject(forwardRef(() => NotificationsService))
    private notificationsService: NotificationsService,
  ) {
    // Give service a reference to this gateway for createAndPush
    setTimeout(() => {
      this.notificationsService.gateway = this;
    }, 0);
  }

  async sendNotificationToUser(userId: string, notification: any) {
    try {
      const sender = notification.senderId
        ? await this.prisma.user.findUnique({
            where: { id: notification.senderId },
            select: { name: true, username: true, avatar: true },
          })
        : null;

      const meta = notification.metaData || {};
      const payload = {
        id: notification.id,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        actorId: notification.senderId,
        actorName: notification.type === 'SYSTEM'
          ? 'Popli System'
          : sender?.username || sender?.name || 'User',
        actorAvatar: notification.type === 'SYSTEM'
          ? 'https://ui-avatars.com/api/?name=Popli&background=1D1037&color=A855F7'
          : sender?.avatar || notification.senderAvatar || null,
        targetType: meta.targetType || (notification.postId ? 'REEL' : 'USER'),
        reelId: notification.postId,
        reelThumbnail: meta.reelThumbnail,
        postId: notification.postId,
        postThumbnail: meta.reelThumbnail,
        storyId: meta.storyId,
        storyThumbnail: meta.storyThumbnail,
        commentId: notification.commentId,
        commentText: meta.commentText,
        giftId: meta.giftId,
        giftType: meta.giftType,
        giftAmount: meta.giftAmount,
        createdAt: notification.createdAt,
        isRead: notification.isRead,
        aggregatedCount: 1,
      };

      // Use ChatGateway's server — same instance where users are connected
      this.chatGateway.server.to(`user_${userId}`).emit('new_notification', payload);

      // Update unread count
      const unreadCount = await this.prisma.notification.count({
        where: { userId, isRead: false, isActive: true },
      });
      this.chatGateway.server
        .to(`user_${userId}`)
        .emit('notification:unread-count', { count: unreadCount });
    } catch (error) {
      console.error('Failed to emit notification via socket:', error);
    }
  }
}