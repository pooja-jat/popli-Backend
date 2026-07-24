import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FeedGateway } from './feed.gateway';

const DEFAULT_WEIGHTS = {
  watchTimeWeight: 45,
  shareWeight: 25,
  nearbyWeight: 20,
  commentWeight: 10,
  moodWeight: 5,
};

@Injectable()
export class FeedService {
  constructor(
    private prisma: PrismaService,
    private feedGateway: FeedGateway,
  ) {}

  private async resolveAdmin(adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN') throw new UnauthorizedException('Not authorized');
    return admin;
  }

  async getConfig(adminId: string) {
    await this.resolveAdmin(adminId);
    const config = await this.prisma.systemConfig.findUnique({
      where: { key: 'recommendationWeights' },
    });
    return config ? (config.valueJson as Record<string, number>) : DEFAULT_WEIGHTS;
  }

  async updateConfig(weights: Record<string, number>, notes: string | undefined, adminId: string) {
    await this.resolveAdmin(adminId);

    const existing = await this.prisma.systemConfig.findUnique({
      where: { key: 'recommendationWeights' },
    });

    const lastVersion = await this.prisma.feedConfigVersion.findFirst({
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    const nextVersion = (lastVersion?.version ?? 0) + 1;

    await this.prisma.$transaction([
      this.prisma.systemConfig.upsert({
        where: { key: 'recommendationWeights' },
        update: { valueJson: weights, updatedBy: adminId },
        create: { key: 'recommendationWeights', valueJson: weights, updatedBy: adminId },
      }),
      this.prisma.feedConfigVersion.create({
        data: {
          version: nextVersion,
          weights,
          notes: notes ?? null,
          changedBy: adminId,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId: adminId,
          action: 'FEED_CONFIG_UPDATED',
          entityType: 'SystemConfig',
          entityId: 'recommendationWeights',
          oldValue: existing ? (existing.valueJson as object) : DEFAULT_WEIGHTS,
          newValue: weights,
        },
      }),
    ]);

    const result = { weights, version: nextVersion, updatedAt: new Date() };
    this.feedGateway.emitConfigUpdated(result);
    return result;
  }

  async getConfigVersions(adminId: string) {
    await this.resolveAdmin(adminId);
    return this.prisma.feedConfigVersion.findMany({
      orderBy: { version: 'desc' },
      take: 20,
    });
  }

  async rollbackConfig(versionId: string, adminId: string) {
    await this.resolveAdmin(adminId);
    const version = await this.prisma.feedConfigVersion.findUnique({ where: { id: versionId } });
    if (!version) throw new Error('Version not found');
    return this.updateConfig(version.weights as Record<string, number>, `Rollback to v${version.version}`, adminId);
  }

  async getBoosts(adminId: string) {
    await this.resolveAdmin(adminId);
    return this.prisma.feedBoost.findMany({
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createBoost(data: {
    type: string;
    target: string;
    intensity: number;
    priority?: number;
    startDate?: string;
    endDate?: string;
    notes?: string;
  }, adminId: string) {
    await this.resolveAdmin(adminId);
    const boost = await this.prisma.feedBoost.create({
      data: {
        type: data.type,
        target: data.target,
        intensity: data.intensity,
        priority: data.priority ?? 0,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        notes: data.notes ?? null,
        isActive: true,
        status: 'ACTIVE',
        createdBy: adminId,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'FEED_BOOST_CREATED',
        entityType: 'FeedBoost',
        entityId: boost.id,
        newValue: boost as object,
      },
    });
    this.feedGateway.emitBoostCreated(boost);
    return boost;
  }

  async updateBoost(boostId: string, data: {
    intensity?: number;
    priority?: number;
    status?: string;
    endDate?: string;
    notes?: string;
  }, adminId: string) {
    await this.resolveAdmin(adminId);
    const old = await this.prisma.feedBoost.findUnique({ where: { id: boostId } });
    const updated = await this.prisma.feedBoost.update({
      where: { id: boostId },
      data: {
        ...(data.intensity !== undefined && { intensity: data.intensity }),
        ...(data.priority !== undefined && { priority: data.priority }),
        ...(data.status !== undefined && {
          status: data.status as any,
          isActive: data.status === 'ACTIVE',
        }),
        ...(data.endDate !== undefined && { endDate: new Date(data.endDate) }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'FEED_BOOST_UPDATED',
        entityType: 'FeedBoost',
        entityId: boostId,
        oldValue: old as object,
        newValue: updated as object,
      },
    });
    this.feedGateway.emitBoostUpdated(updated);
    return updated;
  }

  async deleteBoost(boostId: string, adminId: string) {
    await this.resolveAdmin(adminId);
    await this.prisma.feedBoost.update({
      where: { id: boostId },
      data: { isActive: false, status: 'EXPIRED' },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'FEED_BOOST_DELETED',
        entityType: 'FeedBoost',
        entityId: boostId,
        newValue: { status: 'EXPIRED' },
      },
    });
    this.feedGateway.emitBoostDeleted(boostId);
    return { success: true };
  }

  async simulateFeed(params: {
    category?: string;
    userId?: string;
    city?: string;
    limit?: number;
  }, adminId: string) {
    await this.resolveAdmin(adminId);

    const weights = await this.getConfig(adminId);
    const limit = params.limit ?? 10;

    const where: any = { privacy: 'Public' };
    if (params.category) where.category = params.category;
    if (params.city) where.city = params.city;

    const reels = await this.prisma.reel.findMany({
      where,
      take: 50,
      orderBy: { createdAt: 'desc' },
      include: {
        creator: { select: { id: true, username: true, name: true, avatar: true, followersCount: true } },
        _count: { select: { reports: true } },
      },
    });

    const now = Date.now();
    const scored = reels.map((reel) => {
      const ageHours = (now - new Date(reel.createdAt).getTime()) / 3_600_000;
      const freshness = Math.max(0, 1 - ageHours / 168);

      const totalEngagement = reel.likesCount + reel.commentsCount + reel.sharesCount + 1;
      const watchScore = Math.min(reel.viewsCount / 1000, 1);
      const engagementScore = Math.min((reel.likesCount + reel.commentsCount * 2) / totalEngagement, 1);
      const shareScore = Math.min(reel.sharesCount / 100, 1);
      const creatorScore = Math.min(reel.creator.followersCount / 10000, 1);
      const reportPenalty = Math.min(reel._count.reports * 0.1, 0.5);

      const finalScore =
        watchScore * (weights.watchTimeWeight / 100) +
        shareScore * (weights.shareWeight / 100) +
        engagementScore * (weights.commentWeight / 100) +
        freshness * 0.2 +
        creatorScore * 0.1 -
        reportPenalty;

      return {
        id: reel.id,
        title: reel.description || 'Untitled',
        category: reel.category,
        creatorUsername: reel.creator.username,
        creatorName: reel.creator.name,
        views: reel.viewsCount,
        likes: reel.likesCount,
        shares: reel.sharesCount,
        comments: reel.commentsCount,
        createdAt: reel.createdAt,
        scores: {
          final: Math.round(finalScore * 1000) / 1000,
          watchTime: Math.round(watchScore * 100) / 100,
          engagement: Math.round(engagementScore * 100) / 100,
          share: Math.round(shareScore * 100) / 100,
          freshness: Math.round(freshness * 100) / 100,
          creator: Math.round(creatorScore * 100) / 100,
          reportPenalty: Math.round(reportPenalty * 100) / 100,
        },
        reason: finalScore > 0.5
          ? 'High engagement and recency'
          : finalScore > 0.2
          ? 'Moderate engagement'
          : 'Low signal — may be suppressed',
        penaltyReason: reportPenalty > 0.2
          ? `${reel._count.reports} reports detected`
          : null,
      };
    });

    scored.sort((a, b) => b.scores.final - a.scores.final);
    return { reels: scored.slice(0, limit), weights, simulatedAt: new Date() };
  }

  async getMetrics(adminId: string) {
    await this.resolveAdmin(adminId);
    const [
      totalReels,
      totalViewsAgg,
      totalValidViews,
      pendingEarningsAgg,
      activeUsers,
      pendingReports,
      activeBoosts,
      topCategories,
      topHashtags,
      currentVersion,
    ] = await Promise.all([
      this.prisma.reel.count(),
      this.prisma.reel.aggregate({ _sum: { viewsCount: true } }),
      this.prisma.validView.count(),
      this.prisma.reel.aggregate({ _sum: { pendingEarningsViews: true } }),
      this.prisma.user.count({ where: { role: { in: ['USER', 'CREATOR'] } } }),
      this.prisma.report.count({ where: { status: 'PENDING' } }),
      this.prisma.feedBoost.count({ where: { status: 'ACTIVE' } }),
      this.prisma.reel.groupBy({
        by: ['category'],
        _count: { id: true },
        _sum: { viewsCount: true },
        orderBy: { _sum: { viewsCount: 'desc' } },
        take: 5,
      }),
      this.prisma.hashtag.findMany({
        orderBy: { usageCount: 'desc' },
        take: 5,
        select: { name: true, usageCount: true },
      }),
      this.prisma.feedConfigVersion.findFirst({ orderBy: { version: 'desc' } }),
    ]);

    return {
      totalReels,
      totalViews: totalViewsAgg._sum.viewsCount ?? 0,
      totalValidViews,
      pendingEarningsViews: pendingEarningsAgg._sum.pendingEarningsViews ?? 0,
      activeUsers,
      pendingReports,
      activeBoosts,
      topCategories: topCategories.map((c) => ({
        category: c.category ?? 'unknown',
        count: c._count.id,
        views: c._sum.viewsCount ?? 0,
      })),
      topHashtags,
      configVersion: currentVersion?.version ?? 0,
    };
  }

  async getAuditLogs(adminId: string) {
    await this.resolveAdmin(adminId);
    return this.prisma.auditLog.findMany({
      where: { entityType: { in: ['SystemConfig', 'FeedBoost', 'FeedConfigVersion'] } },
      orderBy: { timestamp: 'desc' },
      take: 50,
    });
  }
}