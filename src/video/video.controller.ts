import {
  Controller,
  Post,
  Get,
  Query,
  UseGuards,
  Req,
  Headers,
  RawBodyRequest,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { VideoService } from './video.service';

@ApiTags('video')
@Controller('video')
export class VideoController {
  constructor(private readonly videoService: VideoService) {}

  @Post('upload-url')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create Mux direct upload URL' })
  createUploadUrl() {
    return this.videoService.createDirectUpload();
  }

  @Get('asset')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Poll Mux asset status by uploadId' })
  getAsset(@Query('uploadId') uploadId: string) {
    if (!uploadId) throw new BadRequestException('uploadId is required');
    return this.videoService.getAssetByUploadId(uploadId);
  }

  @Post('webhook')
  @ApiOperation({ summary: 'Mux webhook handler' })
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('mux-signature') muxSignature: string,
  ) {
    if (!req.rawBody) throw new BadRequestException('Missing raw body');
    await this.videoService.handleWebhook(req.rawBody, muxSignature);
    return { received: true };
  }
}