import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SendGiftDto } from './dto/gifts.dto';
import { Prisma } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';

@Injectable()
export class GiftsService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private notificationsGateway: NotificationsGateway,
  ) {}

  async getGifts() {
    return this.prisma.gift.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  private async getGiftEconomyConfig(): Promise<{
    creatorSharePercent: number;
    coinToInrRate: number;
  }> {
    const [shareConfig, rateConfig] = await Promise.all([
      this.prisma.systemConfig.findUnique({
        where: { key: 'GIFT_CREATOR_SHARE_PERCENT' },
      }),
      this.prisma.systemConfig.findUnique({
        where: { key: 'GIFT_COIN_TO_INR_RATE' },
      }),
    ]);

    return {
      creatorSharePercent:
        shareConfig && typeof shareConfig.valueJson === 'number'
          ? shareConfig.valueJson
          : 60,
      coinToInrRate:
        rateConfig && typeof rateConfig.valueJson === 'number'
          ? rateConfig.valueJson
          : 0.1,
    };
  }

  async sendGift(senderId: string, dto: SendGiftDto) {
    if (senderId === dto.receiverId) {
      throw new BadRequestException('You cannot send a gift to yourself');
    }

    const { creatorSharePercent, coinToInrRate } =
      await this.getGiftEconomyConfig();

    const result = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const gift = await tx.gift.findUnique({ where: { id: dto.giftId } });
        if (!gift) throw new NotFoundException('Gift not found');

        if (dto.reelId) {
          const reel = await tx.reel.findUnique({ where: { id: dto.reelId } });
          if (reel && reel.mediaType === 'PHOTO') {
            throw new BadRequestException(
              'Gifts can only be sent on video reels, not photo posts.',
            );
          }
        }

        const receiverWallet = await tx.wallet.upsert({
          where: { userId: dto.receiverId },
          create: { userId: dto.receiverId },
          update: {},
        });

        const costInCoins =
          gift.costInCoins > 0 ? gift.costInCoins : dto.cost;
        const baseEarnings =
          gift.costInINR > 0 ? gift.costInINR : costInCoins * coinToInrRate;
        const earningsInINR = (baseEarnings * creatorSharePercent) / 100;

        const senderWallet = await tx.wallet.findUnique({
          where: { userId: senderId },
        });

        if (!senderWallet)
          throw new BadRequestException('Sender wallet not found');

        if (costInCoins > 0 && senderWallet.coinBalance < costInCoins) {
          throw new BadRequestException('Insufficient coins');
        }

        const receiverUser = await tx.user.findUnique({
          where: { id: dto.receiverId },
          select: { name: true, username: true },
        });
        const receiverName =
          receiverUser?.name || receiverUser?.username || 'User';

        const senderUser = await tx.user.findUnique({
          where: { id: senderId },
          select: { name: true, username: true },
        });
        const senderName =
          senderUser?.username || senderUser?.name || 'someone';

        if (costInCoins > 0) {
          const deducted = await tx.wallet.updateMany({
            where: {
              id: senderWallet.id,
              coinBalance: { gte: costInCoins },
            },
            data: { coinBalance: { decrement: costInCoins } },
          });

          if (deducted.count === 0) {
            throw new BadRequestException('Insufficient coins');
          }

          await tx.transaction.create({
            data: {
              walletId: senderWallet.id,
              type: 'GIFT_SEND',
              amount: costInCoins,
              currency: 'COINS',
              status: 'SUCCESS',
              description:
                dto.message ||
                `Sent gift: ${gift.name} to ${receiverName}`,
              reelId: dto.reelId || null,
            },
          });
        }

        const updatedReceiverWallet = await tx.wallet.update({
          where: { id: receiverWallet.id },
          data: {
            withdrawableBalance: { increment: earningsInINR },
            totalEarnings: { increment: earningsInINR },
          },
        });

        await tx.walletLedger.create({
          data: {
            userId: dto.receiverId,
            walletId: receiverWallet.id,
            source: 'GIFT_RECEIVED',
            sourceId: gift.id,
            credit: earningsInINR,
            balanceAfter: updatedReceiverWallet.withdrawableBalance,
            description: `Received gift: ${gift.name} from @${senderName} (${creatorSharePercent}% creator share)`,
            reelId: dto.reelId || null,
          },
        });

        return {
          message: 'Gift sent successfully',
          gift,
          earnings: earningsInINR,
          creatorSharePercent,
        };
      },
      { maxWait: 15000, timeout: 15000 },
    );

    try {
      const existingNotif = await this.prisma.notification.findFirst({
        where: {
          userId: dto.receiverId,
          senderId: senderId,
          type: 'GIFT' as any,
          postId: dto.reelId || null,
          commentId: null,
          replyId: null,
        },
      });

      if (existingNotif) {
        await this.prisma.notification.update({
          where: { id: existingNotif.id },
          data: {
            body: `sent you another ${result.gift.name}!`,
            isRead: false,
            updatedAt: new Date(),
          },
        });
      } else {
        await this.prisma.notification.create({
          data: {
            userId: dto.receiverId,
            senderId: senderId,
            type: 'GIFT' as any,
            title: 'You received a gift!',
            body: `sent you a ${result.gift.name}`,
            postId: dto.reelId,
            metaData: {
              giftId: result.gift.id,
              giftType: result.gift.name,
              giftAmount: result.earnings,
              targetType: 'REEL',
            },
          },
        });
      }
    } catch (err) {
      console.error('Failed to send gift notification:', err);
    }

    await this.notificationsService
      .sendPushNotification(
        dto.receiverId,
        'You received a gift!',
        `Someone sent you a ${result.gift.name}!`,
        { type: 'GIFT', reelId: dto.reelId || '' },
      )
      .catch(() => {});

    try {
      const notif = await this.prisma.notification.findFirst({
        where: {
          userId: dto.receiverId,
          senderId: senderId,
          type: 'GIFT' as any,
        },
        orderBy: { createdAt: 'desc' },
      });
      if (notif) {
        this.notificationsGateway
          .sendNotificationToUser(dto.receiverId, notif)
          .catch(() => {});
      }
    } catch (e) {}

    return result;
  }
}