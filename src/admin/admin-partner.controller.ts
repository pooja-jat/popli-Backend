import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminPartnerService } from './admin-partner.service';
import { CreateAdminPartnerDto, UpdateAdminPartnerDto, ResetPartnerPasswordDto } from './dto/admin-partner.dto';

@ApiTags('admin-partners')
@Controller('admin/partners')
export class AdminPartnerController {
  constructor(private readonly adminPartnerService: AdminPartnerService) {}

  @Post('auth/login')
  @ApiOperation({ summary: 'Admin Partner Login' })
  login(@Body() body: { email: string; password: string }) {
    return this.adminPartnerService.loginAsPartner(body.email, body.password);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create admin partner (Super Admin only)' })
  create(@Body() dto: CreateAdminPartnerDto, @Req() req: any) {
    return this.adminPartnerService.create(dto, req.user.id);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all admin partners' })
  findAll(
    @Req() req: any,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminPartnerService.findAll(
      req.user.id,
      search,
      status,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get single admin partner' })
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.adminPartnerService.findOne(id, req.user.id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update admin partner' })
  update(@Param('id') id: string, @Body() dto: UpdateAdminPartnerDto, @Req() req: any) {
    return this.adminPartnerService.update(id, dto, req.user.id);
  }

  @Post(':id/reset-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reset partner password' })
  resetPassword(@Param('id') id: string, @Body() dto: ResetPartnerPasswordDto, @Req() req: any) {
    return this.adminPartnerService.resetPassword(id, dto, req.user.id);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Activate or suspend partner' })
  updateStatus(@Param('id') id: string, @Body() body: { status: 'ACTIVE' | 'SUSPENDED' }, @Req() req: any) {
    return this.adminPartnerService.updateStatus(id, body.status, req.user.id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete admin partner' })
  remove(@Param('id') id: string, @Req() req: any) {
    return this.adminPartnerService.remove(id, req.user.id);
  }
}