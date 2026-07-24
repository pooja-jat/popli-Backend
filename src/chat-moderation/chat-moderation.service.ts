import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ChatFlagType,
  ChatFlagSeverity,
  ChatFlagStatus,
  ChatActionType,
} from '@prisma/client';
import { GetFlagsQueryDto, ModerationActionDto, FlagMessageDto } from './dto/chat-moderation.dto';

const SCAM_PATTERNS = [
  { pattern: /t\.me\//i, type: ChatFlagType.SCAM_LINK, severity: ChatFlagSeverity.HIGH },
  { pattern: /wa\.me\//i, type: ChatFlagType.SCAM_LINK, severity: ChatFlagSeverity.HIGH },
  { pattern: /free.*coin/i, type: ChatFlagType.CRYPTO_SCAM, severity: ChatFlagSeverity.CRITICAL },
  { pattern: /crypto|bitcoin|eth|usdt/i, type: ChatFlagType.CRYPTO_SCAM, severity: ChatFlagSeverity.HIGH },
  { pattern: /click.*link|visit.*link/i, type: ChatFlagType.PHISHING, severity: ChatFlagSeverity.HIGH },
  { pattern: /paytm|gpay|phonepe|upi.*pay/i, type: ChatFlagType.EXTERNAL_PAYMENT, severity: ChatFlagSeverity.MEDIUM },
  { pattern: /kill|rape|murder|die/i, type: ChatFlagType.THREAT, severity: ChatFlagSeverity.CRITICAL },
  { pattern: /sex|nude|nudes|nsfw/i, type: ChatFlagType.SEXUAL_SOLICITATION, severity: ChatFlagSeverity.HIGH },
  { pattern: /http[s]?:\/\/(?!popli\.in)[^\s]+/i, type: ChatFlagType.SCAM_LINK, severity: ChatFlagSeverity.MEDIUM },
  { pattern: /spam|promo|offer|deal|discount/i, type: ChatFlagType.SPAM, severity: ChatFlagSeverity.LOW },
];

@Injectable()
export class ChatModerationService {
  constructor(private prisma: PrismaService) {}

  analyzeMessage(text: string): {
    flagType: ChatFlagType;
    severity: ChatFlagSeverity;
    confidence: number;
    keywords: string[];
    links: string[];
    reason: string;
  } | null {
    if (!text) return null;

    const links = (text.match(/http[s]?:\/\/[^\s]+/gi) || []);
    let highestSeverityMatch: typeof SCAM_PATTERNS[0] | null = null;
    const matchedKeywords: string[] = [];

    for (const rule of SCAM_PATTERNS) {
      const match = text.match(rule.pattern);
      if (match) {
        matchedKeywords.push(match[0]);
        if (
          !highestSeverityMatch ||
          severityRank(rule.severity) > severityRank(highestSeverityMatch.severity)
        ) {
          highestSeverityMatch = rule;
        }
      }
    }

    if (!highestSeverityMatch) return null;

    const confidence = Math.min(0.5 + matchedKeywords.length * 0.15, 0.99);

    return {
      flagType: highestSeverityMatch.type,
      severity: highestSeverityMatch.severity,
      confidence,
      keywords: matchedKeywords,
      links,
      reason: `Auto-detected: ${highestSeverityMatch.type.replace(/_/g, ' ').toLowerCase()}`,
    };
  }

  async scanAndFlagMessage(messageId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { chat: true },
    });
    if (!message || !message.text) return null;

    const result = this.analyzeMessage(message.text);
    if (!result) return null;

    const existing = await this.prisma.chatModerationFlag.findFirst({
      where: { messageId, status: { in: [ChatFlagStatus.OPEN, ChatFlagStatus.INVESTIGATING] } },
    });
    if (existing) return existing;

    return this.prisma.chatModerationFlag.create({
      data: {
        chatId: message.chatId,
        messageId,
        flagType: result.flagType,
        reason: result.reason,
        severity: result.severity,
        confidenceScore: result.confidence,
        detectedKeywords: result.keywords,
        detectedLinks: result.links,
        aiExplanation: `Pattern-based detection triggered on message content. Matched: ${result.keywords.join(', ')}`,
      },
    });
  }

  async getFlags(query: GetFlagsQueryDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.severity) where.severity = query.severity;
    if (query.flagType) where.flagType = query.flagType;
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
      if (query.dateTo) where.createdAt.lte = new Date(query.dateTo);
    }
    if (query.search) {
      where.OR = [
        { reason: { contains: query.search, mode: 'insensitive' } },
        { aiExplanation: { contains: query.search, mode: 'insensitive' } },
        { chatId: { contains: query.search, mode: 'insensitive' } },
        { id: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [flags, total] = await Promise.all([
      this.prisma.chatModerationFlag.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
        include: {
          chat: {
            include: {
              participants: {
                include: {
                  user: { select: { id: true, name: true, username: true, avatar: true } },
                },
              },
            },
          },
          actions: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      }),
      this.prisma.chatModerationFlag.count({ where }),
    ]);

    return {
      data: flags,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getFlagById(flagId: string) {
    const flag = await this.prisma.chatModerationFlag.findUnique({
      where: { id: flagId },
      include: {
        chat: {
          include: {
            participants: {
              include: {
                user: { select: { id: true, name: true, username: true, avatar: true } },
              },
            },
            messages: {
              orderBy: { createdAt: 'asc' },
              include: {
                sender: { select: { id: true, name: true, username: true, avatar: true } },
              },
            },
          },
        },
        actions: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    return flag;
  }

  async getConversation(chatId: string) {
    return this.prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        participants: {
          include: {
            user: { select: { id: true, name: true, username: true, avatar: true } },
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            sender: { select: { id: true, name: true, username: true, avatar: true } },
          },
        },
      },
    });
  }

  async performAction(flagId: string, adminId: string, dto: ModerationActionDto) {
    const flag = await this.prisma.chatModerationFlag.findUnique({ where: { id: flagId } });
    if (!flag) throw new Error('Flag not found');

    const previousState = { status: flag.status };
    let newStatus: ChatFlagStatus = flag.status;

    if (dto.action === ChatActionType.DISMISS_FLAG) newStatus = ChatFlagStatus.DISMISSED;
    else if (dto.action === ChatActionType.RESOLVE) newStatus = ChatFlagStatus.RESOLVED;
    else if (dto.action === ChatActionType.ESCALATE) newStatus = ChatFlagStatus.ESCALATED;
    else newStatus = ChatFlagStatus.INVESTIGATING;

    const [updatedFlag, action] = await this.prisma.$transaction([
      this.prisma.chatModerationFlag.update({
        where: { id: flagId },
        data: { status: newStatus, reviewedAt: new Date(), reviewedBy: adminId },
      }),
      this.prisma.chatModerationAction.create({
        data: {
          flagId,
          adminId,
          action: dto.action,
          reason: dto.reason,
          targetUserId: dto.targetUserId,
          previousState,
          newState: { status: newStatus },
        },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId: adminId,
          action: dto.action,
          entityType: 'ChatModerationFlag',
          entityId: flagId,
          oldValue: previousState,
          newValue: { status: newStatus, reason: dto.reason },
        },
      }),
    ]);

    if (dto.targetUserId) {
      if (dto.action === ChatActionType.BAN_USER) {
        await this.prisma.user.update({
          where: { id: dto.targetUserId },
          data: { isBlocked: true },
        });
      } else if (dto.action === ChatActionType.WARN_USER) {
        await this.prisma.auditLog.create({
          data: {
            actorId: adminId,
            action: 'WARN_USER',
            entityType: 'User',
            entityId: dto.targetUserId,
            newValue: { reason: dto.reason, flagId },
          },
        });
      }
    }

    return { flag: updatedFlag, action };
  }

  async getStats() {
    const [
      total,
      open,
      critical,
      resolvedToday,
      byType,
      bySeverity,
    ] = await Promise.all([
      this.prisma.chatModerationFlag.count(),
      this.prisma.chatModerationFlag.count({ where: { status: ChatFlagStatus.OPEN } }),
      this.prisma.chatModerationFlag.count({ where: { severity: ChatFlagSeverity.CRITICAL } }),
      this.prisma.chatModerationFlag.count({
        where: {
          status: ChatFlagStatus.RESOLVED,
          reviewedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
      this.prisma.chatModerationFlag.groupBy({ by: ['flagType'], _count: true }),
      this.prisma.chatModerationFlag.groupBy({ by: ['severity'], _count: true }),
    ]);

    return { total, open, critical, resolvedToday, byType, bySeverity };
  }

  async flagsBySection(section: string) {
    const sectionMap: Record<string, any> = {
      'open': { status: ChatFlagStatus.OPEN },
      'critical': { severity: ChatFlagSeverity.CRITICAL },
      'spam': { flagType: ChatFlagType.SPAM },
      'scam': { flagType: ChatFlagType.SCAM_LINK },
      'harassment': { flagType: ChatFlagType.HARASSMENT },
      'nsfw': { flagType: ChatFlagType.NSFW },
      'hate': { flagType: ChatFlagType.HATE_SPEECH },
      'impersonation': { flagType: ChatFlagType.IMPERSONATION },
      'pending': { status: ChatFlagStatus.OPEN },
      'resolved': { status: ChatFlagStatus.RESOLVED },
    };
    return sectionMap[section] || {};
  }
}

function severityRank(s: ChatFlagSeverity): number {
  return { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 }[s] ?? 0;
}