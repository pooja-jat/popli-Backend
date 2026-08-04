import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export const EARNING_CONFIG_CACHE_KEY = 'platform:earning-config';
const MEMORY_CACHE_TTL_MS = 60_000; // 60 seconds

export interface EarningConfig {
  viewsPerReward: number;
  rewardAmountPaise: number;
  earningsEnabled: boolean;
  minWatchDurationMs: number;
}

export interface WithdrawalConfig {
  minWithdrawalInr: number;
  tdsPercentage: number;
  platformFeePercentage: number;
}
@Injectable()
export class PlatformService {
  private readonly logger = new Logger(PlatformService.name);

  private memoryCache: EarningConfig | null = null;
  private memoryCacheExpiresAt: number = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getEarningConfig(): Promise<EarningConfig> {
    // Layer 1 — memory cache
    if (this.memoryCache && Date.now() < this.memoryCacheExpiresAt) {
      return this.memoryCache;
    }

    // Layer 2 — Redis
    const cached = await this.redis.get(EARNING_CONFIG_CACHE_KEY);
    if (cached) {
      const config = JSON.parse(cached) as EarningConfig;
      this.memoryCache = config;
      this.memoryCacheExpiresAt = Date.now() + MEMORY_CACHE_TTL_MS;
      return config;
    }

    // Layer 3 — PostgreSQL
    return this.loadAndCacheEarningConfig();
  }

  async getWithdrawalConfig(): Promise<WithdrawalConfig> {
    const [minRow, tdsRow, feeRow] = await Promise.all([
      this.prisma.systemConfig.findUnique({ where: { key: 'MIN_WITHDRAWAL_INR' } }),
      this.prisma.systemConfig.findUnique({ where: { key: 'TDS_PERCENTAGE' } }),
      this.prisma.systemConfig.findUnique({ where: { key: 'PLATFORM_FEE_PERCENTAGE' } }),
    ]);

    if (!minRow || typeof minRow.valueJson !== 'number') {
      throw new Error('Platform configuration MIN_WITHDRAWAL_INR is not set. Contact support.');
    }
    if (!tdsRow || typeof tdsRow.valueJson !== 'number') {
      throw new Error('Platform configuration TDS_PERCENTAGE is not set. Contact support.');
    }
    if (!feeRow || typeof feeRow.valueJson !== 'number') {
      throw new Error('Platform configuration PLATFORM_FEE_PERCENTAGE is not set. Contact support.');
    }

    return {
      minWithdrawalInr: minRow.valueJson,
      tdsPercentage: tdsRow.valueJson,
      platformFeePercentage: feeRow.valueJson,
    };
  }

  async loadAndCacheEarningConfig(): Promise<EarningConfig> {
const [viewsPerRewardRow, rewardAmountPaiseRow, earningsEnabledRow, minWatchDurationRow] =
      await Promise.all([
        this.prisma.systemConfig.findUnique({ where: { key: 'VIEWS_PER_REWARD' } }),
        this.prisma.systemConfig.findUnique({ where: { key: 'REWARD_AMOUNT_PAISE' } }),
        this.prisma.systemConfig.findUnique({ where: { key: 'EARNINGS_ENABLED' } }),
        this.prisma.systemConfig.findUnique({ where: { key: 'MIN_WATCH_DURATION_MS' } }),
      ]);
if (!viewsPerRewardRow || typeof viewsPerRewardRow.valueJson !== 'number') {
      throw new Error('Platform configuration VIEWS_PER_REWARD is not set. Contact support.');
    }
    if (!rewardAmountPaiseRow || typeof rewardAmountPaiseRow.valueJson !== 'number') {
      throw new Error('Platform configuration REWARD_AMOUNT_PAISE is not set. Contact support.');
    }
    if (!earningsEnabledRow || typeof earningsEnabledRow.valueJson !== 'boolean') {
      throw new Error('Platform configuration EARNINGS_ENABLED is not set. Contact support.');
    }
    if (!minWatchDurationRow || typeof minWatchDurationRow.valueJson !== 'number') {
      throw new Error('Platform configuration MIN_WATCH_DURATION_MS is not set. Contact support.');
    }

    const config: EarningConfig = {
      viewsPerReward: viewsPerRewardRow.valueJson,
      rewardAmountPaise: rewardAmountPaiseRow.valueJson,
      earningsEnabled: earningsEnabledRow.valueJson,
      minWatchDurationMs: minWatchDurationRow.valueJson,
    };

    await this.redis.set(EARNING_CONFIG_CACHE_KEY, JSON.stringify(config));
    this.logger.log(`Earning config cached: ${JSON.stringify(config)}`);
    return config;
  }

async upsertConfig(key: string, value: any): Promise<void> {
    await this.prisma.systemConfig.upsert({
      where: { key },
      create: { key, valueJson: value },
      update: { valueJson: value },
    });
  }

  async invalidateEarningConfigCache(): Promise<void> {
    this.memoryCache = null;
    this.memoryCacheExpiresAt = 0;
    await this.redis.del(EARNING_CONFIG_CACHE_KEY);
  }
}