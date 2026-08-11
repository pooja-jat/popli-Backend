import {
  Controller,
  Post,
  Get,
  Query,
  UseGuards,
  Req,
  Headers,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import type { RawBodyRequest } from '@nestjs/common';
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
  @ApiOperation({ summary: 'Create Cloudflare Stream direct upload URL' })
  createUploadUrl() {
    return this.videoService.createDirectUpload();
  }

@Post('upload')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Proxy video upload to Cloudflare Stream' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 209715200 } }))
  async uploadVideo(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');
    return this.videoService.uploadVideoBuffer(file.buffer, file.mimetype);
  }
  @Get('asset')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Poll Cloudflare Stream video status by uploadId' })
  getAsset(@Query('uploadId') uploadId: string) {
    if (!uploadId) throw new BadRequestException('uploadId is required');
    return this.videoService.getAssetByUploadId(uploadId);
  }

  @Post('webhook')
  @ApiOperation({ summary: 'Cloudflare Stream webhook handler' })
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('webhook-signature') signature: string,
  ) {
    if (!req.rawBody) throw new BadRequestException('Missing raw body');
    await this.videoService.handleWebhook(req.rawBody, signature);
    return { received: true };
  }
}