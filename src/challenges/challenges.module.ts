import { Module } from '@nestjs/common';
import { ChallengesService } from './challenges.service';
import { ChallengesController } from './challenges.controller';
import { ChallengesGateway } from './challenges.gateway';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  providers: [ChallengesService, ChallengesGateway],
  controllers: [ChallengesController],
  exports: [ChallengesService, ChallengesGateway],
})
export class ChallengesModule {}