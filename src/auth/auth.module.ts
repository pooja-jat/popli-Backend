import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { FirebaseAdminService } from './firebase-admin.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { BrevoModule } from '../brevo/brevo.module';
import { OtpCleanupScheduler } from './otp-cleanup.scheduler';
@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'super-secret-jwt-key',
      signOptions: { expiresIn: '7d' },
    }),
    NotificationsModule,
    BrevoModule,
  ],
  controllers: [AuthController],
 providers: [AuthService, JwtStrategy, FirebaseAdminService, OtpCleanupScheduler],
  exports: [AuthService],
})
export class AuthModule {}