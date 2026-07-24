import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FeedService } from './feed.service';

@Controller('admin/feed')
@UseGuards(JwtAuthGuard)
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  @Get('config')
  getConfig(@Req() req: any) {
    return this.feedService.getConfig(req.user.id);
  }

  @Patch('config')
  updateConfig(@Body() body: { weights: Record<string, number>; notes?: string }, @Req() req: any) {
    return this.feedService.updateConfig(body.weights, body.notes, req.user.id);
  }

  @Get('config/versions')
  getVersions(@Req() req: any) {
    return this.feedService.getConfigVersions(req.user.id);
  }

  @Post('config/rollback/:versionId')
  rollback(@Param('versionId') versionId: string, @Req() req: any) {
    return this.feedService.rollbackConfig(versionId, req.user.id);
  }

  @Get('boosts')
  getBoosts(@Req() req: any) {
    return this.feedService.getBoosts(req.user.id);
  }

  @Post('boosts')
  createBoost(@Body() body: any, @Req() req: any) {
    return this.feedService.createBoost(body, req.user.id);
  }

  @Patch('boosts/:id')
  updateBoost(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.feedService.updateBoost(id, body, req.user.id);
  }

  @Delete('boosts/:id')
  deleteBoost(@Param('id') id: string, @Req() req: any) {
    return this.feedService.deleteBoost(id, req.user.id);
  }

  @Get('simulate')
  simulate(
    @Query('category') category: string,
    @Query('city') city: string,
    @Query('limit') limit: string,
    @Req() req: any,
  ) {
    return this.feedService.simulateFeed({ category, city, limit: limit ? parseInt(limit) : 10 }, req.user.id);
  }

  @Get('metrics')
  getMetrics(@Req() req: any) {
    return this.feedService.getMetrics(req.user.id);
  }

  @Get('audit-logs')
  getAuditLogs(@Req() req: any) {
    return this.feedService.getAuditLogs(req.user.id);
  }
}