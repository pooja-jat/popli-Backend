import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { checkAndProcessReferral } from '../utils/referral.util';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

async login(email: string, passwordString: string) {
    const admin = await this.prisma.user.findFirst({
      where: { email, role: 'ADMIN' },
    });

    if (!admin) {
      const existingAdminsCount = await this.prisma.user.count({
        where: { role: 'ADMIN' },
      });
      if (
        existingAdminsCount === 0 &&
        email === 'admin@popli.com' &&
        passwordString === 'admin123'
      ) {
        const hashedPassword = await bcrypt.hash('admin123', 10);
        const newAdmin = await this.prisma.user.create({
          data: {
            name: 'Super Admin',
            username: 'popli_admin',
            email: 'admin@popli.com',
            passwordHash: hashedPassword,
            role: 'ADMIN',
            isVerified: true,
            phone: '+910000000000',
          },
        });
        const token = this.jwtService.sign({ sub: newAdmin.id, role: newAdmin.role });
        return {
          token,
          user: { id: newAdmin.id, name: newAdmin.name, email: newAdmin.email, role: 'super_admin' },
        };
      }

      const partner = await this.prisma.adminPartner.findUnique({ where: { email } });
      if (partner) {
        if (partner.status === 'SUSPENDED') {
          throw new UnauthorizedException('Your account has been suspended. Contact the Super Admin.');
        }
        const isPartnerMatch = await bcrypt.compare(passwordString, partner.passwordHash);
        if (!isPartnerMatch) throw new UnauthorizedException('Invalid credentials');

        await this.prisma.adminPartner.update({
          where: { id: partner.id },
          data: { lastLoginAt: new Date() },
        });

        const token = this.jwtService.sign({
          sub: partner.id,
          isPartner: true,
          permissions: partner.permissions,
        });

        return {
          token,
          user: {
            id: partner.id,
            name: partner.fullName,
            email: partner.email,
            role: 'admin_partner',
            permissions: partner.permissions,
            designation: partner.designation,
          },
        };
      }

      throw new UnauthorizedException('Invalid admin credentials');
    }

    const isMatch = await bcrypt.compare(passwordString, admin.passwordHash || '');
    if (!isMatch) throw new UnauthorizedException('Invalid password');

    const token = this.jwtService.sign({ sub: admin.id, role: admin.role });
    return {
      token,
      user: { id: admin.id, name: admin.name, email: admin.email, role: 'super_admin' },
    };
  }

async getMonetizationSummary(adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    const partner = admin ? null : await this.prisma.adminPartner.findUnique({ where: { id: adminId } });
    if (!admin && !partner) throw new UnauthorizedException('Not authorized');

    const [
      topEarners,
      pendingWithdrawals,
      totalPaidOut,
      totalPendingAgg,
    ] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: 'CREATOR' },
        orderBy: { wallet: { totalEarnings: 'desc' } },
        take: 10,
        select: {
          id: true,
          name: true,
          username: true,
          avatar: true,
          wallet: {
            select: {
              totalEarnings: true,
              coinBalance: true,
              withdrawableBalance: true,
              totalWithdrawn: true,
            },
          },
        },
      }),
      this.prisma.withdrawalRequest.findMany({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        include: {
          wallet: {
            include: {
              user: {
                select: {
                  name: true,
                  username: true,
                  kycRecord: { select: { upiId: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.withdrawalRequest.aggregate({
        where: { status: 'SUCCESS' },
        _sum: { amount: true },
      }),
      this.prisma.withdrawalRequest.aggregate({
        where: { status: 'PENDING' },
        _sum: { amount: true },
      }),
    ]);

    return {
      topEarners: topEarners.map((u) => ({
        id: u.id,
        name: u.name,
        username: u.username,
        avatar: u.avatar,
        totalEarnings: u.wallet?.totalEarnings ?? 0,
        coinBalance: u.wallet?.coinBalance ?? 0,
        withdrawableBalance: u.wallet?.withdrawableBalance ?? 0,
        totalWithdrawn: u.wallet?.totalWithdrawn ?? 0,
      })),
      pendingWithdrawals: pendingWithdrawals.map((w) => ({
        id: w.id,
        creatorName: w.wallet?.user?.name ?? 'Unknown',
        creatorUsername: w.wallet?.user?.username ?? 'unknown',
        amount: w.amount,
        rupees: w.amount,
        method: w.wallet?.user?.kycRecord?.upiId ?? 'UPI',
        status: 'pending',
        createdAt: w.createdAt,
      })),
      summary: {
        totalPaidOut: totalPaidOut._sum.amount ?? 0,
        totalPendingAmount: totalPendingAgg._sum.amount ?? 0,
        pendingCount: pendingWithdrawals.length,
      },
    };
  }

async getFeatureFlags(adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    const partner = !admin
      ? await this.prisma.adminPartner.findUnique({ where: { id: adminId } })
      : null;
    if (!admin && !partner) throw new UnauthorizedException('Not authorized');

    const flags = await this.prisma.platformFeatureFlag.findMany({
      orderBy: { key: 'asc' },
    });

    const result: Record<string, boolean> = {};
    flags.forEach((f) => { result[f.key] = f.enabled; });

    return {
      AI_MODERATION_ENABLED: result['AI_MODERATION_ENABLED'] ?? false,
      AUTO_SHADOW_BAN_ENABLED: result['AUTO_SHADOW_BAN_ENABLED'] ?? false,
      IP_FINGERPRINTING_ENABLED: result['IP_FINGERPRINTING_ENABLED'] ?? false,
      AUTO_PUSH_CHALLENGES_ENABLED: result['AUTO_PUSH_CHALLENGES_ENABLED'] ?? false,
    };
  }

  async updateFeatureFlag(key: string, enabled: boolean, adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN') throw new UnauthorizedException('Only Super Admin can modify feature flags');

    const flag = await this.prisma.platformFeatureFlag.upsert({
      where: { key },
      update: { enabled, updatedBy: adminId },
      create: { key, enabled, updatedBy: adminId },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: `FEATURE_FLAG_${enabled ? 'ENABLED' : 'DISABLED'}`,
        entityType: 'PlatformFeatureFlag',
        entityId: flag.id,
        oldValue: { key, enabled: !enabled },
        newValue: { key, enabled },
      },
    });

    return { key: flag.key, enabled: flag.enabled };
  }

  async getPublicPlatformStats() {
    const [
      totalCreators,
      totalReels,
      suspiciousUsersCount,
      coinRevenue,
    ] = await Promise.all([
      this.prisma.user.count({ where: { role: 'CREATOR' } }),
      this.prisma.reel.count(),
      this.prisma.user.count({ where: { OR: [{ isShadowBanned: true }, { isBlocked: true }] } }),
      this.prisma.transaction.aggregate({
        where: { type: 'COIN_RECHARGE', status: 'SUCCESS' },
        _sum: { amount: true },
      }),
    ]);

    return {
      totalCreators,
      totalReels,
      suspiciousUsersBlocked: suspiciousUsersCount,
      totalCoinRevenue: coinRevenue._sum.amount || 0,
    };
  }

  async getDashboardStats(adminId: string) {
    const totalUsers = await this.prisma.user.count({
      where: { role: 'USER' },
    });
    const totalCreators = await this.prisma.user.count({
      where: { role: 'CREATOR' },
    });
    const totalReels = await this.prisma.reel.count();
    const pendingWithdrawals = await this.prisma.transaction.count({
      where: { type: 'WITHDRAWAL', status: 'PENDING' },
    });

const coinsAgg = await this.prisma.transaction.aggregate({
      where: { type: 'COIN_RECHARGE', status: 'SUCCESS' },
      _sum: { amount: true },
    });

    const giftAgg = await this.prisma.transaction.aggregate({
      where: { type: 'GIFT_SEND', status: 'SUCCESS' },
      _sum: { amount: true },
    });

const botState = await this.prisma.botProtectionState.findFirst({
      orderBy: { createdAt: 'asc' },
    });

    const securityEvents = await this.prisma.securityEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return {
      totalUsers,
      totalCreators,
      totalReels,
      pendingWithdrawals,
      distributedCoins: coinsAgg._sum.amount || 0,
      giftRevenue: giftAgg._sum.amount || 0,
      botProtection: {
        enabled: botState?.enabled ?? false,
        enabledAt: botState?.enabledAt ?? null,
        enabledBy: botState?.enabledBy ?? null,
      },
      securityEvents: securityEvents.map((e) => ({
        id: e.id,
        type: e.eventType,
        eventType: e.eventType,
        severity: e.severity,
        performedBy: e.performedByName,
        description: e.description,
        region: null,
        status: 'LOGGED',
        createdAt: e.createdAt,
        time: new Date(e.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      })),
    };
  }
  async getPendingKyc() {
    return this.prisma.kYCRecord.findMany({
      where: { status: 'PENDING' },
      include: { user: { select: { id: true, username: true, name: true } } },
    });
  }

  async approveKyc(kycId: string, adminId: string) {
    // Basic admin verification
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN')
      throw new UnauthorizedException('Not authorized');

    const kyc = await this.prisma.kYCRecord.update({
      where: { id: kycId },
      data: { status: 'APPROVED', reviewedAt: new Date() },
    });

    // Update user verification badge
    await this.prisma.user.update({
      where: { id: kyc.userId },
      data: { isVerified: true, role: 'CREATOR' },
    });

    checkAndProcessReferral(this.prisma, kyc.userId).catch((err) => {
      console.error('Referral process error on KYC approval', err);
    });

    return { message: 'KYC Approved successfully' };
  }

  async suspendUser(userId: string, adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN')
      throw new UnauthorizedException('Not authorized');

    return this.prisma.user.update({
      where: { id: userId },
      data: { role: 'USER', isVerified: false },
    });
  }

  async deleteReel(reelId: string, adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN')
      throw new UnauthorizedException('Not authorized');

    return this.prisma.reel.delete({ where: { id: reelId } });
  }

async getUsers(adminId: string) {
  const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
  if (!admin || admin.role !== 'ADMIN')
    throw new UnauthorizedException('Not authorized');
  return this.prisma.user.findMany({
    where: { role: { in: ['USER', 'CREATOR'] }, isBlocked: false },
    orderBy: { createdAt: 'desc' },
    include: {
      wallet: { select: { totalEarnings: true } },
      _count: { select: { reels: true } },
      reels: { select: { viewsCount: true } },
    },
  });
}
  async getReels(adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN')
      throw new UnauthorizedException('Not authorized');
    return this.prisma.reel.findMany({
      include: {
        creator: { select: { username: true, name: true, avatar: true } },
        taggedUsers: { select: { username: true, id: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTransactions(adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN')
      throw new UnauthorizedException('Not authorized');
    return this.prisma.transaction.findMany({
      include: {
        wallet: {
          include: { user: { select: { username: true, name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getReports(adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN')
      throw new UnauthorizedException('Not authorized');
    return this.prisma.report.findMany({
      include: {
        reporter: { select: { username: true, name: true } },
        reel: {
          select: {
            description: true,
            creator: { select: { username: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTickets(adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN')
      throw new UnauthorizedException('Not authorized');
    return this.prisma.supportTicket.findMany({
      include: { creator: { select: { username: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Transactions & Withdrawals
  async getWithdrawals(adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN')
      throw new UnauthorizedException('Not authorized');

  return this.prisma.withdrawalRequest.findMany({
      include: {
        wallet: {
          include: {
            user: {
              select: {
                username: true,
                name: true,
                kycRecord: { select: { upiId: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approveWithdrawal(reqId: string, adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN')
      throw new UnauthorizedException('Not authorized');

    return this.prisma.$transaction(async (tx) => {
      const request = await tx.withdrawalRequest.findUnique({
        where: { id: reqId },
      });
      if (!request || request.status !== 'PENDING') {
        throw new BadRequestException('Request not found or already processed');
      }

      const updated = await tx.withdrawalRequest.update({
        where: { id: reqId },
        data: { status: 'APPROVED' },
      });

      await tx.wallet.update({
        where: { id: request.walletId },
        data: { totalWithdrawn: { increment: request.amount } },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          actorId: adminId,
          action: 'WITHDRAWAL_APPROVED',
          entityType: 'WithdrawalRequest',
          entityId: reqId,
          newValue: { status: 'APPROVED' },
        },
      });

      return updated;
    });
  }

  async rejectWithdrawal(
    reqId: string,
    adminId: string,
    reason: string = 'Rejected by Admin',
  ) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN')
      throw new UnauthorizedException('Not authorized');

    return this.prisma.$transaction(async (tx) => {
      const request = await tx.withdrawalRequest.findUnique({
        where: { id: reqId },
      });
      if (!request || request.status !== 'PENDING') {
        throw new BadRequestException('Request not found or already processed');
      }

      // Refund the gross amount to withdrawableBalance
      const wallet = await tx.wallet.update({
        where: { id: request.walletId },
        data: { withdrawableBalance: { increment: request.amount } },
      });

      // Create Ledger Entry for Rollback
      await tx.walletLedger.create({
        data: {
          userId: wallet.userId,
          walletId: wallet.id,
          source: 'FRAUD_REVERSAL',
          sourceId: request.id,
          credit: request.amount,
          balanceAfter: wallet.withdrawableBalance,
          description: `Withdrawal rejected and refunded: ${reason}`,
        },
      });

      const updated = await tx.withdrawalRequest.update({
        where: { id: reqId },
        data: { status: 'REJECTED' },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          actorId: adminId,
          action: 'WITHDRAWAL_REJECTED',
          entityType: 'WithdrawalRequest',
          entityId: reqId,
          newValue: { status: 'REJECTED', reason },
        },
      });

      return updated;
    });
  }

  // Gifts
  async getGifts() {
    return this.prisma.gift.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

async addGift(data: any, adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN')
      throw new UnauthorizedException('Not authorized');

    const lastGift = await this.prisma.gift.findFirst({
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    return this.prisma.gift.create({
      data: {
        name: data.name,
        costInCoins: data.coinPrice ?? data.costInCoins ?? 0,
        costInINR: data.costInINR ?? 0,
        iconUrl: data.icon ?? data.iconUrl,
        animationType: data.animationType || 'fly',
        isActive: data.isActive ?? true,
        sortOrder: (lastGift?.sortOrder ?? 0) + 1,
      },
    });
  }

  async updateGift(giftId: string, data: any, adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN')
      throw new UnauthorizedException('Not authorized');

    return this.prisma.gift.update({
      where: { id: giftId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.coinPrice !== undefined && { costInCoins: data.coinPrice }),
        ...(data.costInCoins !== undefined && { costInCoins: data.costInCoins }),
        ...(data.costInINR !== undefined && { costInINR: data.costInINR }),
        ...(data.icon !== undefined && { iconUrl: data.icon }),
        ...(data.iconUrl !== undefined && { iconUrl: data.iconUrl }),
        ...(data.animationType !== undefined && { animationType: data.animationType }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
      },
    });
  }

  async deleteGift(giftId: string, adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN')
      throw new UnauthorizedException('Not authorized');

    return this.prisma.gift.delete({
      where: { id: giftId },
    });
  }

  // System Configs
  async getConfigs(adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN')
      throw new UnauthorizedException('Not authorized');

    const configs = await this.prisma.systemConfig.findMany();
    const result: Record<string, any> = {};
    configs.forEach((c) => {
      result[c.key] = c.valueJson;
    });
    return result;
  }

  async updateConfig(key: string, value: any, adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN')
      throw new UnauthorizedException('Not authorized');

    return this.prisma.systemConfig.upsert({
      where: { key },
      update: { valueJson: value, updatedBy: adminId },
      create: { key, valueJson: value, updatedBy: adminId },
    });
  }
  async getCoinPackages(adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN')
      throw new UnauthorizedException('Not authorized');

    return this.prisma.coinPackage.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  async createCoinPackage(data: any, adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN')
      throw new UnauthorizedException('Not authorized');

    const last = await this.prisma.coinPackage.findFirst({
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

 return this.prisma.coinPackage.create({
      data: {
        title: data.title,
        coins: data.coins,
        bonusCoins: data.bonusCoins ?? 0,
        priceInr: data.priceInr,
        badge: data.badge ?? null,
        badgeColor: data.badgeColor ?? null,
        description: data.description ?? null,
        isPopular: data.isPopular ?? false,
        isRecommended: data.isRecommended ?? false,
        isActive: data.isActive ?? true,
        sortOrder: (last?.sortOrder ?? 0) + 1,
      },
    });
  }

  async updateCoinPackage(packageId: string, data: any, adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN')
      throw new UnauthorizedException('Not authorized');

return this.prisma.coinPackage.update({
      where: { id: packageId },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.coins !== undefined && { coins: data.coins }),
        ...(data.bonusCoins !== undefined && { bonusCoins: data.bonusCoins }),
        ...(data.priceInr !== undefined && { priceInr: data.priceInr }),
        ...(data.badge !== undefined && { badge: data.badge }),
        ...(data.badgeColor !== undefined && { badgeColor: data.badgeColor }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.isPopular !== undefined && { isPopular: data.isPopular }),
        ...(data.isRecommended !== undefined && { isRecommended: data.isRecommended }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
      },
    });
  }
async getEarningSettings(adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN') throw new UnauthorizedException('Not authorized');

    const keys = ['VIEWS_PER_REWARD', 'REWARD_AMOUNT_PAISE', 'EARNINGS_ENABLED'];
    const rows = await this.prisma.systemConfig.findMany({ where: { key: { in: keys } } });
    const map: Record<string, any> = {};
    rows.forEach((r) => { map[r.key] = r.valueJson; });

    return {
      viewsPerReward: map['VIEWS_PER_REWARD'] ?? 200,
      rewardAmountPaise: map['REWARD_AMOUNT_PAISE'] ?? 100,
      earningsEnabled: map['EARNINGS_ENABLED'] ?? true,
    };
  }

  async updateEarningSettings(
    data: { viewsPerReward?: number; rewardAmountPaise?: number; earningsEnabled?: boolean },
    adminId: string,
    redisService: any,
    kafkaProducer: any,
  ) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN') throw new UnauthorizedException('Not authorized');

    const updates: Promise<any>[] = [];

    if (data.viewsPerReward !== undefined) {
      updates.push(
        this.prisma.systemConfig.upsert({
          where: { key: 'VIEWS_PER_REWARD' },
          update: { valueJson: data.viewsPerReward, updatedBy: adminId },
          create: { key: 'VIEWS_PER_REWARD', valueJson: data.viewsPerReward, updatedBy: adminId },
        }),
      );
    }

    if (data.rewardAmountPaise !== undefined) {
      updates.push(
        this.prisma.systemConfig.upsert({
          where: { key: 'REWARD_AMOUNT_PAISE' },
          update: { valueJson: data.rewardAmountPaise, updatedBy: adminId },
          create: { key: 'REWARD_AMOUNT_PAISE', valueJson: data.rewardAmountPaise, updatedBy: adminId },
        }),
      );
    }

    if (data.earningsEnabled !== undefined) {
      updates.push(
        this.prisma.systemConfig.upsert({
          where: { key: 'EARNINGS_ENABLED' },
          update: { valueJson: data.earningsEnabled, updatedBy: adminId },
          create: { key: 'EARNINGS_ENABLED', valueJson: data.earningsEnabled, updatedBy: adminId },
        }),
      );
    }

    await Promise.all(updates);

    await redisService.del('platform:earning-config');

    await kafkaProducer.publish('platform-settings-updated', [
      {
        key: 'earning-config',
        value: JSON.stringify({
          event: 'platform-settings-updated',
          updatedBy: adminId,
          timestamp: new Date().toISOString(),
          data,
        }),
      },
    ]);

    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'EARNING_SETTINGS_UPDATED',
        entityType: 'SystemConfig',
        entityId: 'earning-settings',
        newValue: data,
      },
    });

    return { success: true, updated: data };
  }

  async deleteCoinPackage(packageId: string, adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN')
      throw new UnauthorizedException('Not authorized');

    return this.prisma.coinPackage.delete({ where: { id: packageId } });
  }

async getCampaigns(adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN') throw new UnauthorizedException('Not authorized');
    return this.prisma.campaign.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async createCampaign(data: any, adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN') throw new UnauthorizedException('Not authorized');
    return this.prisma.campaign.create({
      data: {
        title: data.title,
        type: data.type,
        status: data.status || 'active',
        targetAudience: data.targetAudience || null,
        targetCity: data.targetCity || null,
        hashtag: data.hashtag || null,
        scheduledTime: data.scheduledTime ? new Date(data.scheduledTime) : null,
        createdBy: adminId,
      },
    });
  }

  async updateCampaignStatus(campaignId: string, status: string, adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN') throw new UnauthorizedException('Not authorized');
    return this.prisma.campaign.update({
      where: { id: campaignId },
      data: { status },
    });
  }

  async deleteCampaign(campaignId: string, adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN') throw new UnauthorizedException('Not authorized');
    return this.prisma.campaign.delete({ where: { id: campaignId } });
  }

  async getAnalytics(adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN') throw new UnauthorizedException('Not authorized');

    const [
      topReels,
      categoryGroups,
      cityGroups,
      topCreators,
      earningSnapshots,
      topHashtags,
      giftAgg,
      coinAgg,
      withdrawalAgg,
      userGrowthRaw,
    ] = await Promise.all([
      this.prisma.reel.findMany({
        orderBy: { viewsCount: 'desc' },
        take: 10,
        select: {
          id: true,
          description: true,
          viewsCount: true,
          likesCount: true,
          sharesCount: true,
          commentsCount: true,
          category: true,
          createdAt: true,
          creator: { select: { username: true, name: true } },
        },
      }),
      this.prisma.reel.groupBy({
        by: ['category'],
        _count: { id: true },
        _sum: { viewsCount: true, likesCount: true },
        orderBy: { _sum: { viewsCount: 'desc' } },
      }),
      this.prisma.reel.groupBy({
        by: ['city'],
        where: { city: { not: null } },
        _count: { id: true },
        _sum: { viewsCount: true },
        orderBy: { _sum: { viewsCount: 'desc' } },
        take: 8,
      }),
      this.prisma.user.findMany({
        orderBy: { followersCount: 'desc' },
        take: 10,
        select: {
          id: true,
          name: true,
          username: true,
          avatar: true,
          followersCount: true,
          totalLikesReceived: true,
          _count: { select: { reels: true } },
          wallet: { select: { totalEarnings: true } },
        },
      }),
      this.prisma.earningSnapshot.groupBy({
        by: ['date'],
        _sum: { totalEarnings: true, viewEarnings: true, giftEarnings: true },
        orderBy: { date: 'asc' },
        take: 30,
      }),
      this.prisma.hashtag.findMany({
        orderBy: { usageCount: 'desc' },
        take: 10,
        select: { id: true, name: true, usageCount: true, recentScore: true },
      }),
      this.prisma.transaction.aggregate({
        where: { type: 'GIFT_SEND', status: 'SUCCESS' },
        _sum: { amount: true },
      }),
      this.prisma.transaction.aggregate({
        where: { type: 'COIN_RECHARGE', status: 'SUCCESS' },
        _sum: { amount: true },
      }),
      this.prisma.withdrawalRequest.aggregate({
        where: { status: 'SUCCESS' },
        _sum: { amount: true },
      }),
      this.prisma.$queryRaw<{ month: string; count: bigint }[]>`
        SELECT TO_CHAR(DATE_TRUNC('month', "createdAt"), 'Mon') as month,
               COUNT(*)::bigint as count
        FROM "User"
        WHERE "createdAt" >= NOW() - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', "createdAt")
        ORDER BY DATE_TRUNC('month', "createdAt") ASC
      `,
    ]);

    return {
      topReels: topReels.map(r => ({
        id: r.id,
        title: r.description || 'Untitled',
        category: r.category || 'unknown',
        views: r.viewsCount,
        likes: r.likesCount,
        shares: r.sharesCount,
        comments: r.commentsCount,
        creatorUsername: r.creator.username,
        creatorName: r.creator.name,
        createdAt: r.createdAt,
      })),
      categoryBreakdown: categoryGroups.map(g => ({
        category: g.category || 'unknown',
        reelCount: g._count.id,
        totalViews: g._sum.viewsCount || 0,
        totalLikes: g._sum.likesCount || 0,
      })),
      cityBreakdown: cityGroups.map(g => ({
        city: g.city || 'Unknown',
        reelCount: g._count.id,
        totalViews: g._sum.viewsCount || 0,
      })),
      topCreators: topCreators.map(u => ({
        id: u.id,
        name: u.name,
        username: u.username,
        avatar: u.avatar,
        followers: u.followersCount,
        totalLikes: u.totalLikesReceived,
        reelCount: u._count.reels,
        totalEarnings: u.wallet?.totalEarnings || 0,
      })),
      earningsTrend: earningSnapshots.map(e => ({
        date: new Date(e.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        totalEarnings: e._sum.totalEarnings || 0,
        viewEarnings: e._sum.viewEarnings || 0,
        giftEarnings: e._sum.giftEarnings || 0,
      })),
      topHashtags: topHashtags.map(h => ({
        id: h.id,
        name: h.name,
        usageCount: h.usageCount,
        recentScore: h.recentScore,
      })),
      revenueStats: {
        giftRevenue: giftAgg._sum.amount || 0,
        coinRevenue: coinAgg._sum.amount || 0,
        totalWithdrawn: withdrawalAgg._sum.amount || 0,
      },
      userGrowth: userGrowthRaw.map(r => ({
        month: r.month,
        count: Number(r.count),
      })),
    };
  }

  async getFeedMetrics(adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN')
      throw new UnauthorizedException('Not authorized');

    const totalReels = await this.prisma.reel.count();
    const totalViews = await this.prisma.reel.aggregate({ _sum: { viewsCount: true } });
    const totalValidViews = await this.prisma.validView.count();
    const pendingEarningsViews = await this.prisma.reel.aggregate({ _sum: { pendingEarningsViews: true } });
    const activeUsers = await this.prisma.user.count({ where: { role: { in: ['USER', 'CREATOR'] } } });
    const totalReports = await this.prisma.report.count({ where: { status: 'PENDING' } });

    return {
      totalReels,
      totalViews: totalViews._sum.viewsCount || 0,
      totalValidViews,
      pendingEarningsViews: pendingEarningsViews._sum.pendingEarningsViews || 0,
      activeUsers,
      pendingReports: totalReports,
    };
  }

  async getFeedBoosts(adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN')
      throw new UnauthorizedException('Not authorized');

    return this.prisma.feedBoost.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createFeedBoost(data: { type: string; target: string; intensity: number }, adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN')
      throw new UnauthorizedException('Not authorized');

    return this.prisma.feedBoost.create({
      data: {
        type: data.type,
        target: data.target,
        intensity: data.intensity,
        isActive: true,
        createdBy: adminId,
      },
    });
  }

async getFraudStats(adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN')
      throw new UnauthorizedException('Not authorized');

    const [
      shadowBannedUsers,
      blockedUsers,
      revokedSessions,
      suspiciousIps,
      suspiciousDevices,
      highVolumeViewers,
    ] = await Promise.all([
      this.prisma.user.findMany({
        where: { isShadowBanned: true },
        select: {
          id: true,
          name: true,
          username: true,
          avatar: true,
          city: true,
          createdAt: true,
          earningsFrozen: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),

      this.prisma.user.findMany({
        where: { isBlocked: true },
        select: {
          id: true,
          name: true,
          username: true,
          avatar: true,
          city: true,
          createdAt: true,
          earningsFrozen: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),

      this.prisma.session.count({ where: { revoked: true } }),

      this.prisma.session.groupBy({
        by: ['ipAddress'],
        where: {
          ipAddress: { not: null },
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 15,
      }),

      this.prisma.session.groupBy({
        by: ['deviceInfo'],
        where: {
          deviceInfo: { not: null },
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 15,
      }),

      this.prisma.viewEvent.groupBy({
        by: ['deviceId'],
        where: {
          deviceId: { not: null },
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 15,
      }),
    ]);

    const SUSPICIOUS_IP_THRESHOLD = 3;
    const SUSPICIOUS_DEVICE_THRESHOLD = 5;
    const HIGH_VOLUME_VIEW_THRESHOLD = 50;

    return {
      shadowBannedCount: shadowBannedUsers.length,
      blockedCount: blockedUsers.length,
      revokedSessionsCount: revokedSessions,
      suspiciousUsers: [
        ...shadowBannedUsers.map((u) => ({ ...u, flagType: 'shadow_banned' as const })),
        ...blockedUsers.map((u) => ({ ...u, flagType: 'blocked' as const })),
      ],
      suspiciousIps: suspiciousIps
        .filter((s) => s._count.id >= SUSPICIOUS_IP_THRESHOLD)
        .map((s) => ({
          ipAddress: s.ipAddress,
          sessionCount: s._count.id,
          riskLevel: s._count.id >= 10 ? 'critical' : s._count.id >= 5 ? 'high' : 'medium',
        })),
      suspiciousDevices: suspiciousDevices
        .filter((s) => s._count.id >= SUSPICIOUS_DEVICE_THRESHOLD)
        .map((s) => ({
          deviceInfo: s.deviceInfo,
          sessionCount: s._count.id,
          riskLevel: s._count.id >= 20 ? 'critical' : s._count.id >= 10 ? 'high' : 'medium',
        })),
      highVolumeViewers: highVolumeViewers
        .filter((v) => v._count.id >= HIGH_VOLUME_VIEW_THRESHOLD)
        .map((v) => ({
          deviceId: v.deviceId,
          viewCount: v._count.id,
          riskLevel: v._count.id >= 200 ? 'critical' : v._count.id >= 100 ? 'high' : 'medium',
        })),
    };
  }

  async deleteFeedBoost(boostId: string, adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN')
      throw new UnauthorizedException('Not authorized');

    return this.prisma.feedBoost.update({
      where: { id: boostId },
      data: { isActive: false },
    });
  }

  async unbanUser(userId: string, adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN')
      throw new UnauthorizedException('Not authorized');

    return this.prisma.user.update({
      where: { id: userId },
      data: { isBlocked: false },
    });
  }

  async verifyUser(userId: string, adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN')
      throw new UnauthorizedException('Not authorized');

    return this.prisma.user.update({
      where: { id: userId },
      data: { isVerified: true },
    });
  }

  async removeVerification(userId: string, adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN')
      throw new UnauthorizedException('Not authorized');

    return this.prisma.user.update({
      where: { id: userId },
      data: { isVerified: false },
    });
  }

  async shadowBanUser(userId: string, adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN')
      throw new UnauthorizedException('Not authorized');

    return this.prisma.user.update({
      where: { id: userId },
      data: { isShadowBanned: true },
    });
  }

  async freezeEarnings(userId: string, adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN')
      throw new UnauthorizedException('Not authorized');

  const user = await this.prisma.user.findUnique({ where: { id: userId } });
    return this.prisma.user.update({
      where: { id: userId },
      data: { earningsFrozen: !user?.earningsFrozen },
    });
  }

  async toggleMonetization(userId: string, adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN')
      throw new UnauthorizedException('Not authorized');

const user = await this.prisma.user.findUnique({ where: { id: userId } });
    return this.prisma.user.update({
      where: { id: userId },
      data: { isMonetized: !user?.isMonetized },
    });
  }

  async hideReel(reelId: string, adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN')
      throw new UnauthorizedException('Not authorized');

  const reel = await this.prisma.reel.findUnique({ where: { id: reelId } });
    return this.prisma.reel.update({
      where: { id: reelId },
      data: { privacy: reel?.privacy === 'Private' ? 'Public' : 'Private' },
    });
  }

  async forceTrendReel(reelId: string, adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN')
      throw new UnauthorizedException('Not authorized');

const reel = await this.prisma.reel.findUnique({ where: { id: reelId } });
    return this.prisma.reel.update({
      where: { id: reelId },
      data: { isTrending: !reel?.isTrending },
    });
  }

  async restrictAgeReel(reelId: string, adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN')
      throw new UnauthorizedException('Not authorized');

 const reel = await this.prisma.reel.findUnique({ where: { id: reelId } });
    return this.prisma.reel.update({
      where: { id: reelId },
      data: { ageRestricted: !reel?.ageRestricted },
    });
  }

  async disableCommentsReel(reelId: string, adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN')
      throw new UnauthorizedException('Not authorized');

const reel = await this.prisma.reel.findUnique({ where: { id: reelId } });
    return this.prisma.reel.update({
      where: { id: reelId },
      data: { allowComments: !reel?.allowComments },
    });
  }

  async resolveReport(reportId: string, action: string, adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN')
      throw new UnauthorizedException('Not authorized');

    return this.prisma.report.update({
      where: { id: reportId },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    });
  }

  async replyToTicket(ticketId: string, message: string, adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN')
      throw new UnauthorizedException('Not authorized');

    await this.prisma.ticketMessage.create({
      data: {
        ticketId,
        senderId: adminId,
        senderRole: 'ADMIN',
        message,
      },
    });

    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: 'IN_PROGRESS' },
    });
  }
}