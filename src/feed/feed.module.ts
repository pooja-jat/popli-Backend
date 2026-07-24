import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';
import { FeedGateway } from './feed.gateway';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({ secret: process.env.JWT_SECRET }),
  ],
  controllers: [FeedController],
  providers: [FeedService, FeedGateway],
  exports: [FeedService, FeedGateway],
})
export class FeedModule {}