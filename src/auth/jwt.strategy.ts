import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload: any) {
    if (payload.isPartner) {
      const partner = await this.prisma.adminPartner.findUnique({
        where: { id: payload.sub },
      });

      if (!partner) {
        throw new UnauthorizedException({ code: 'PARTNER_NOT_FOUND', message: 'Partner account no longer exists.' });
      }
      if (partner.status === 'SUSPENDED') {
        throw new UnauthorizedException({ code: 'ACCOUNT_SUSPENDED', message: 'Your account has been suspended.' });
      }

      return {
        id: partner.id,
        role: 'ADMIN_PARTNER',
        isPartner: true,
        permissions: partner.permissions as Record<string, boolean>,
        email: partner.email,
        name: partner.fullName,
      };
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });

    if (!user) {
      throw new UnauthorizedException({ code: 'USER_NOT_FOUND', message: 'User account no longer exists.' });
    }
    if (user.isBlocked) {
      throw new UnauthorizedException({ code: 'ACCOUNT_DISABLED', message: 'Your account has been disabled.' });
    }

    return user;
  }
}