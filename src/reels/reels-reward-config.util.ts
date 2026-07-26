import { PrismaService } from '../prisma/prisma.service';
import { InternalServerErrorException } from '@nestjs/common';

export interface ViewerRewardConfig {
  coinRewardPerView: number;
  maxDailyCoins: number;
}

export interface LikerRewardConfig {
  coinRewardPer2Likes: number;
  maxDailyCoins: number;
}

export async function getViewerRewardConfig(
  prisma: PrismaService,
): Promise<ViewerRewardConfig> {
  const [rewardConfig, maxConfig] = await Promise.all([
    prisma.systemConfig.findUnique({ where: { key: 'VIEWER_COIN_REWARD_PER_VIEW' } }),
    prisma.systemConfig.findUnique({ where: { key: 'VIEWER_COIN_MAX_DAILY' } }),
  ]);

  if (!rewardConfig || typeof rewardConfig.valueJson !== 'number') {
    throw new InternalServerErrorException(
      'Platform configuration VIEWER_COIN_REWARD_PER_VIEW is not set. Run the database seed or set it via the Admin Panel.',
    );
  }

  if (!maxConfig || typeof maxConfig.valueJson !== 'number') {
    throw new InternalServerErrorException(
      'Platform configuration VIEWER_COIN_MAX_DAILY is not set. Run the database seed or set it via the Admin Panel.',
    );
  }

  return {
    coinRewardPerView: rewardConfig.valueJson,
    maxDailyCoins: maxConfig.valueJson,
  };
}

export async function getLikerRewardConfig(
  prisma: PrismaService,
): Promise<LikerRewardConfig> {
  const [rewardConfig, maxConfig] = await Promise.all([
    prisma.systemConfig.findUnique({ where: { key: 'LIKER_COIN_REWARD_PER_2_LIKES' } }),
    prisma.systemConfig.findUnique({ where: { key: 'LIKER_COIN_MAX_DAILY' } }),
  ]);

  if (!rewardConfig || typeof rewardConfig.valueJson !== 'number') {
    throw new InternalServerErrorException(
      'Platform configuration LIKER_COIN_REWARD_PER_2_LIKES is not set. Run the database seed or set it via the Admin Panel.',
    );
  }

  if (!maxConfig || typeof maxConfig.valueJson !== 'number') {
    throw new InternalServerErrorException(
      'Platform configuration LIKER_COIN_MAX_DAILY is not set. Run the database seed or set it via the Admin Panel.',
    );
  }

  return {
    coinRewardPer2Likes: rewardConfig.valueJson,
    maxDailyCoins: maxConfig.valueJson,
  };
}