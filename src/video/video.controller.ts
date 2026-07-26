import { Controller, Post, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { VideoService } from './video.service';

@ApiTags('video')
@Controller('video')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class VideoController {
  constructor(private readonly videoService: VideoService) {}

  @Post('upload-url')
  @ApiOperation({ summary: 'Create a Mux direct upload URL for a reel' })
  createUploadUrl() {
    return this.videoService.createDirectUpload();
  }

  @Get('asset')
  @ApiOperation({ summary: 'Poll Mux asset status after upload' })
  @ApiQuery({ name: 'uploadId', required: true })
  getAsset(@Query('uploadId') uploadId: string) {
    return this.videoService.getAssetFromUpload(uploadId);
  }
}