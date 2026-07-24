import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { CreateAdminPartnerDto, UpdateAdminPartnerDto, ResetPartnerPasswordDto } from './dto/admin-partner.dto';

@Injectable()
export class AdminPartnerService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  private async verifySuperAdmin(adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN') {
      throw new ForbiddenException('Only Super Admin can manage admin partners');
    }
    return admin;
  }

  async loginAsPartner(email: string, password: string) {
    const partner = await this.prisma.adminPartner.findUnique({ where: { email } });
    if (!partner) throw new UnauthorizedException('Invalid credentials');
    if (partner.status === 'SUSPENDED') throw new UnauthorizedException('Your account has been suspended. Contact the Super Admin.');

    const isMatch = await bcrypt.compare(password, partner.passwordHash);
    if (!isMatch) throw new UnauthorizedException('Invalid credentials');

    await this.prisma.adminPartner.update({
      where: { id: partner.id },
      data: { lastLoginAt: new Date() },
    });

    const token = this.jwtService.sign({
      sub: partner.id,
      isPartner: true,
      permissions: partner.permissions,
    });

    return {
      token,
      user: {
        id: partner.id,
        name: partner.fullName,
        email: partner.email,
        role: 'admin_partner',
        permissions: partner.permissions,
        designation: partner.designation,
      },
    };
  }

  async create(dto: CreateAdminPartnerDto, adminId: string) {
    await this.verifySuperAdmin(adminId);

    const existingEmail = await this.prisma.adminPartner.findUnique({ where: { email: dto.email } });
    if (existingEmail) throw new ConflictException('Email already in use');

    const existingUsername = await this.prisma.adminPartner.findUnique({ where: { username: dto.username } });
    if (existingUsername) throw new ConflictException('Username already taken');

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const partner = await this.prisma.adminPartner.create({
      data: {
        fullName: dto.fullName,
        username: dto.username,
        email: dto.email,
        passwordHash,
        phone: dto.phone ?? null,
        designation: dto.designation,
        department: dto.department ?? null,
        status: dto.status,
        permissions: dto.permissions,
        createdBy: adminId,
      },
    });

    const { passwordHash: _, ...safe } = partner;
    return safe;
  }

  async findAll(adminId: string, search?: string, status?: string, page = 1, limit = 20) {
    await this.verifySuperAdmin(adminId);

    const where: any = {};
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { username: { contains: search, mode: 'insensitive' } },
        { designation: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status && (status === 'ACTIVE' || status === 'SUSPENDED')) {
      where.status = status;
    }

    const [total, partners] = await Promise.all([
      this.prisma.adminPartner.count({ where }),
      this.prisma.adminPartner.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          fullName: true,
          username: true,
          email: true,
          phone: true,
          designation: true,
          department: true,
          status: true,
          permissions: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
          createdBy: true,
        },
      }),
    ]);

    return {
      data: partners,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string, adminId: string) {
    await this.verifySuperAdmin(adminId);
    const partner = await this.prisma.adminPartner.findUnique({
      where: { id },
      select: {
        id: true,
        fullName: true,
        username: true,
        email: true,
        phone: true,
        designation: true,
        department: true,
        status: true,
        permissions: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        createdBy: true,
      },
    });
    if (!partner) throw new NotFoundException('Admin partner not found');
    return partner;
  }

  async update(id: string, dto: UpdateAdminPartnerDto, adminId: string) {
    await this.verifySuperAdmin(adminId);

    const partner = await this.prisma.adminPartner.findUnique({ where: { id } });
    if (!partner) throw new NotFoundException('Admin partner not found');

    if (dto.email && dto.email !== partner.email) {
      const existing = await this.prisma.adminPartner.findUnique({ where: { email: dto.email } });
      if (existing) throw new ConflictException('Email already in use');
    }
    if (dto.username && dto.username !== partner.username) {
      const existing = await this.prisma.adminPartner.findUnique({ where: { username: dto.username } });
      if (existing) throw new ConflictException('Username already taken');
    }

    const updated = await this.prisma.adminPartner.update({
      where: { id },
      data: {
        ...(dto.fullName && { fullName: dto.fullName }),
        ...(dto.username && { username: dto.username }),
        ...(dto.email && { email: dto.email }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.designation && { designation: dto.designation }),
        ...(dto.department !== undefined && { department: dto.department }),
        ...(dto.status && { status: dto.status }),
        ...(dto.permissions && { permissions: dto.permissions }),
      },
      select: {
        id: true,
        fullName: true,
        username: true,
        email: true,
        phone: true,
        designation: true,
        department: true,
        status: true,
        permissions: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return updated;
  }

  async resetPassword(id: string, dto: ResetPartnerPasswordDto, adminId: string) {
    await this.verifySuperAdmin(adminId);
    const partner = await this.prisma.adminPartner.findUnique({ where: { id } });
    if (!partner) throw new NotFoundException('Admin partner not found');

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.adminPartner.update({ where: { id }, data: { passwordHash } });
    return { message: 'Password reset successfully' };
  }

  async updateStatus(id: string, status: 'ACTIVE' | 'SUSPENDED', adminId: string) {
    await this.verifySuperAdmin(adminId);
    const partner = await this.prisma.adminPartner.findUnique({ where: { id } });
    if (!partner) throw new NotFoundException('Admin partner not found');

    await this.prisma.adminPartner.update({ where: { id }, data: { status } });
    return { message: `Partner ${status === 'ACTIVE' ? 'activated' : 'suspended'} successfully` };
  }

  async remove(id: string, adminId: string) {
    await this.verifySuperAdmin(adminId);
    const partner = await this.prisma.adminPartner.findUnique({ where: { id } });
    if (!partner) throw new NotFoundException('Admin partner not found');

    await this.prisma.adminPartner.delete({ where: { id } });
    return { message: 'Admin partner deleted successfully' };
  }
}