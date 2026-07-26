import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UploadService } from './upload.service';

@ApiTags('upload')
@Controller('upload')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Get('presign')
  @ApiOperation({ summary: 'Get R2 presigned URL for direct image upload' })
  @ApiQuery({ name: 'folder', required: false })
  @ApiQuery({ name: 'filename', required: true })
  @ApiQuery({ name: 'contentType', required: true })
  getPresignedUrl(
    @Query('folder') folder: string = 'general',
    @Query('filename') filename: string,
    @Query('contentType') contentType: string,
  ) {
    return this.uploadService.getPresignedUploadUrl(folder, filename, contentType);
  }
}