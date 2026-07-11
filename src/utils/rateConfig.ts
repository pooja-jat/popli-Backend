import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_VIEW_RATE_PER_1000 } from './earningCalculator';

export async function getViewRate(prisma: PrismaService): Promise<number> {
  const config = await prisma.systemConfig.findUnique({
    where: { key: 'VIEW_RATE_PER_1000' },
  });
  return config && typeof config.valueJson === 'number'
    ? config.valueJson
    : DEFAULT_VIEW_RATE_PER_1000;
}