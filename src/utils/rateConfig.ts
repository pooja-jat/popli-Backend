import { PrismaService } from '../prisma/prisma.service';
import { InternalServerErrorException } from '@nestjs/common';

export async function getViewRate(prisma: PrismaService): Promise<number> {
  const config = await prisma.systemConfig.findUnique({
    where: { key: 'VIEW_RATE_PER_1000' },
  });

  if (!config || typeof config.valueJson !== 'number') {
    throw new InternalServerErrorException(
      'Platform configuration VIEW_RATE_PER_1000 is not set. Run the database seed or set it via the Admin Panel.',
    );
  }

  return config.valueJson;
}