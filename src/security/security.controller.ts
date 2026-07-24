import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SecurityService } from './security.service';
import { BotProtectionActionDto } from './dto/bot-protection.dto';

@ApiTags('security')
@Controller('admin/security')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SecurityController {
  constructor(private readonly securityService: SecurityService) {}

  @Get('bot-protection')
  @ApiOperation({ summary: 'Get current bot protection status and recent security events' })
  getStatus(@Req() req: any) {
    return this.securityService.getStatus(req.user.id);
  }

  @Post('bot-protection/enable')
  @ApiOperation({ summary: 'Enable bot protection mode' })
  enable(@Body() dto: BotProtectionActionDto, @Req() req: any) {
    const ip = req.headers['x-forwarded-for'] ?? req.socket?.remoteAddress;
    const ua = req.headers['user-agent'];
    return this.securityService.enable(req.user.id, dto, ip, ua);
  }

  @Post('bot-protection/disable')
  @ApiOperation({ summary: 'Disable bot protection mode' })
  disable(@Body() dto: BotProtectionActionDto, @Req() req: any) {
    const ip = req.headers['x-forwarded-for'] ?? req.socket?.remoteAddress;
    const ua = req.headers['user-agent'];
    return this.securityService.disable(req.user.id, dto, ip, ua);
  }
}