import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SystemService } from './system.service';

@ApiTags('system')
@Controller('system')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get('public-configs')
  @ApiOperation({
    summary:
      'Get public financial/business configs, coin packages, rates, gift catalog (no auth required)',
  })
  getPublicConfigs() {
    return this.systemService.getPublicConfigs();
  }
}