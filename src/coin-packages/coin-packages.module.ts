import { Module } from '@nestjs/common';
import { CoinPackagesController } from './coin-packages.controller';
import { CoinPackagesService } from './coin-packages.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CoinPackagesController],
  providers: [CoinPackagesService],
  exports: [CoinPackagesService],
})
export class CoinPackagesModule {}