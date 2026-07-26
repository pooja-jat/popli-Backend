import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { SystemService } from './system.service';

@ApiTags('system')
@Controller('system')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get('configs')
  @ApiOperation({ summary: 'Get specific system config values by key names' })
  @ApiQuery({ name: 'keys', required: true, description: 'Comma-separated config keys' })
  async getConfigsByKeys(@Query('keys') keys: string) {
    if (!keys || !keys.trim()) {
      throw new BadRequestException('Query param "keys" is required');
    }
    const keyList = keys.split(',').map((k) => k.trim()).filter(Boolean);
    if (keyList.length === 0) {
      throw new BadRequestException('At least one key must be provided');
    }
    return this.systemService.getConfigsByKeys(keyList);
  }

  @Get('public-configs')
  @ApiOperation({ summary: 'Get all public platform configs, coin packages, and gift catalog' })
  getPublicConfigs() {
    return this.systemService.getPublicConfigs();
  }
}