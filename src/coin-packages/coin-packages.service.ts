import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CoinPackagesService {
  constructor(private prisma: PrismaService) {}

  async findAllPublic() {
    return this.prisma.coinPackage.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        title: true,
        coins: true,
        bonusCoins: true,
        priceInr: true,
        badge: true,
        badgeColor: true,
        description: true,
        isPopular: true,
        isRecommended: true,
        sortOrder: true,
      },
    });
  }

  async findAll() {
    return this.prisma.coinPackage.findMany({
      orderBy: { sortOrder: 'asc' },
    });
  }

  async findOne(id: string) {
    const pkg = await this.prisma.coinPackage.findUnique({ where: { id } });
    if (!pkg) throw new NotFoundException('Coin package not found');
    return pkg;
  }

  async create(data: any) {
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

  async update(id: string, data: any) {
    await this.findOne(id);
    return this.prisma.coinPackage.update({
      where: { id },
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

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.coinPackage.delete({ where: { id } });
  }

  async validateAndGetPackage(packageId: string) {
    const pkg = await this.prisma.coinPackage.findUnique({
      where: { id: packageId },
    });
    if (!pkg) throw new NotFoundException('Coin package not found');
    if (!pkg.isActive) throw new BadRequestException('This coin package is no longer available');
    return pkg;
  }
}