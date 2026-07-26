import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlatformJobsService {
  private readonly logger = new Logger(PlatformJobsService.name);

  constructor(private prisma: PrismaService) {}

  private async isFlagEnabled(key: string): Promise<boolean> {
    const flag = await this.prisma.platformFeatureFlag.findUnique({ where: { key } });
    return flag?.enabled ?? false;
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async runAutoShadowBan() {
    const enabled = await this.isFlagEnabled('AUTO_SHADOW_BAN_ENABLED');
    if (!enabled) return;

    this.logger.log('Running auto shadow-ban job');

    const REPORT_THRESHOLD = 5;
    const LOOKBACK_DAYS = 7;
    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

    const highReportUsers = await this.prisma.report.groupBy({
      by: ['reporterId'],
      where: { createdAt: { gte: since }, status: 'PENDING' },
      _count: { id: true },
      having: { id: { _count: { gte: REPORT_THRESHOLD } } },
    });

    const reelReportGroups = await this.prisma.report.groupBy({
      by: ['reelId'],
      where: { createdAt: { gte: since }, status: 'PENDING', reelId: { not: null } },
      _count: { id: true },
      having: { id: { _count: { gte: REPORT_THRESHOLD } } },
    });

    const reelIds = reelReportGroups.map((r) => r.reelId).filter(Boolean) as string[];

    const creatorIds = reelIds.length > 0
      ? (await this.prisma.reel.findMany({
          where: { id: { in: reelIds } },
          select: { creatorId: true },
        })).map((r) => r.creatorId)
      : [];

    const allTargetIds = [...new Set([...creatorIds])];

    if (allTargetIds.length === 0) {
      this.logger.log('Auto shadow-ban: no users to flag');
      return;
    }

    await this.prisma.user.updateMany({
      where: {
        id: { in: allTargetIds },
        isShadowBanned: false,
        role: { in: ['USER', 'CREATOR'] },
      },
      data: { isShadowBanned: true },
    });

    for (const userId of allTargetIds) {
      await this.prisma.auditLog.create({
        data: {
          actorId: 'system',
          action: 'AUTO_SHADOW_BAN',
          entityType: 'User',
          entityId: userId,
          newValue: { reason: 'Exceeded report threshold', threshold: REPORT_THRESHOLD, windowDays: LOOKBACK_DAYS },
        },
      });
    }

    this.logger.log(`Auto shadow-ban: flagged ${allTargetIds.length} users`);
  }

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async runAutoPushChallenges() {
    const enabled = await this.isFlagEnabled('AUTO_PUSH_CHALLENGES_ENABLED');
    if (!enabled) return;

    this.logger.log('Running auto-push challenges job');

    const activeChallenges = await this.prisma.challenge.findMany({
      where: {
        status: 'ACTIVE',
        endDate: { gte: new Date() },
      },
      take: 3,
      orderBy: { participantCount: 'desc' },
      select: { id: true, title: true },
    });

    if (activeChallenges.length === 0) {
      this.logger.log('Auto-push challenges: no active challenges found');
      return;
    }

    const creators = await this.prisma.user.findMany({
      where: { role: 'CREATOR', isBlocked: false, isShadowBanned: false },
      select: { id: true },
    });

    for (const challenge of activeChallenges) {
      for (const creator of creators) {
await this.prisma.notification.upsert({
          where: {
            userId_senderId_type_commentId_postId_replyId: {
              userId: creator.id,
              senderId: null as any,
              type: 'CHALLENGE_INVITE',
              commentId: null as any,
              postId: challenge.id,
              replyId: null as any,
            },
          },
          update: { isRead: false, updatedAt: new Date() },
          create: {
            userId: creator.id,
            type: 'CHALLENGE_INVITE',
            title: 'Join Today\'s Challenge',
            body: `New challenge available: ${challenge.title}`,
            postId: challenge.id,
            isRead: false,
          },
        }).catch(() => {});
      }
    }

    this.logger.log(`Auto-push challenges: sent notifications for ${activeChallenges.length} challenges to ${creators.length} creators`);
  }
}