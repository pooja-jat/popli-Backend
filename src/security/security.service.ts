import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BotProtectionActionDto } from './dto/bot-protection.dto';

@Injectable()
export class SecurityService {
  constructor(private prisma: PrismaService) {}

  private async resolveActor(actorId: string) {
    const superAdmin = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { id: true, name: true, role: true },
    });
    if (superAdmin) return { name: superAdmin.name, isSuperAdmin: superAdmin.role === 'ADMIN' };

    const partner = await this.prisma.adminPartner.findUnique({
      where: { id: actorId },
      select: { id: true, fullName: true, permissions: true },
    });
    if (partner) {
      const perms = partner.permissions as Record<string, boolean>;
      return {
        name: partner.fullName,
        isSuperAdmin: false,
        hasSecurityPerm: !!perms?.['manage_fraud'],
      };
    }

    throw new ForbiddenException('Actor not found');
  }

  private async ensureAuthorized(actorId: string) {
    const actor = await this.resolveActor(actorId);
    if (!actor.isSuperAdmin && !(actor as any).hasSecurityPerm) {
      throw new ForbiddenException('Insufficient permissions for bot protection management');
    }
    return actor;
  }

  private async getOrCreateState() {
    let state = await this.prisma.botProtectionState.findFirst({
      orderBy: { createdAt: 'asc' },
    });
    if (!state) {
      state = await this.prisma.botProtectionState.create({
        data: { enabled: false },
      });
    }
    return state;
  }

  async getStatus(actorId: string) {
    await this.ensureAuthorized(actorId);
    const state = await this.getOrCreateState();

    let enabledByName: string | null = null;
    if (state.enabledBy) {
      const actor = await this.resolveActor(state.enabledBy).catch(() => null);
      if (actor) enabledByName = actor.name;
    }

    const recentEvents = await this.prisma.securityEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return {
      enabled: state.enabled,
      enabledBy: state.enabledBy,
      enabledByName,
      enabledAt: state.enabledAt,
      disabledAt: state.disabledAt,
      reason: state.reason,
      updatedAt: state.updatedAt,
      recentEvents,
    };
  }

  async enable(actorId: string, dto: BotProtectionActionDto, ipAddress?: string, userAgent?: string) {
    const actor = await this.ensureAuthorized(actorId);
    const state = await this.getOrCreateState();

    const updated = await this.prisma.botProtectionState.update({
      where: { id: state.id },
      data: {
        enabled: true,
        enabledBy: actorId,
        enabledAt: new Date(),
        disabledAt: null,
        disabledBy: null,
        reason: dto.reason ?? null,
      },
    });

    await this.prisma.securityEvent.create({
      data: {
        eventType: 'BOT_PROTECTION_ENABLED',
        severity: 'HIGH',
        performedBy: actorId,
        performedByName: actor.name,
        description: dto.reason ?? 'Bot protection enabled by administrator',
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        metadata: { previousState: state.enabled },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'BOT_PROTECTION_ENABLED',
        entityType: 'BotProtectionState',
        entityId: state.id,
        oldValue: { enabled: state.enabled },
        newValue: { enabled: true, reason: dto.reason },
      },
    });

    return {
      enabled: updated.enabled,
      enabledAt: updated.enabledAt,
      message: 'Bot protection enabled successfully',
    };
  }

  async disable(actorId: string, dto: BotProtectionActionDto, ipAddress?: string, userAgent?: string) {
    const actor = await this.ensureAuthorized(actorId);
    const state = await this.getOrCreateState();

    const updated = await this.prisma.botProtectionState.update({
      where: { id: state.id },
      data: {
        enabled: false,
        disabledBy: actorId,
        disabledAt: new Date(),
        reason: dto.reason ?? null,
      },
    });

    await this.prisma.securityEvent.create({
      data: {
        eventType: 'BOT_PROTECTION_DISABLED',
        severity: 'MEDIUM',
        performedBy: actorId,
        performedByName: actor.name,
        description: dto.reason ?? 'Bot protection disabled by administrator',
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        metadata: { previousState: state.enabled },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'BOT_PROTECTION_DISABLED',
        entityType: 'BotProtectionState',
        entityId: state.id,
        oldValue: { enabled: state.enabled },
        newValue: { enabled: false, reason: dto.reason },
      },
    });

    return {
      enabled: updated.enabled,
      disabledAt: updated.disabledAt,
      message: 'Bot protection disabled successfully',
    };
  }
}