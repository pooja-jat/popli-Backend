import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CoinPackagesService } from './coin-packages.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('coin-packages')
@Controller('coin-packages')
export class CoinPackagesController {
  constructor(private readonly coinPackagesService: CoinPackagesService) {}

  @Get('public')
  @ApiOperation({ summary: 'Get all active coin packages (no auth)' })
  getPublic() {
    return this.coinPackagesService.findAllPublic();
  }

  @Get('admin')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all coin packages including inactive (admin)' })
  getAll() {
    return this.coinPackagesService.findAll();
  }

  @Post('admin')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create coin package' })
  create(@Body() body: any) {
    return this.coinPackagesService.create(body);
  }

  @Patch('admin/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update coin package' })
  update(@Param('id') id: string, @Body() body: any) {
    return this.coinPackagesService.update(id, body);
  }

  @Delete('admin/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete coin package' })
  remove(@Param('id') id: string) {
    return this.coinPackagesService.remove(id);
  }
}