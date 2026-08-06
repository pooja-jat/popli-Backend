import { Injectable, BadRequestException } from '@nestjs/common';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class UploadService {
  private s3: S3Client;
  private bucket: string;
  private publicUrl: string;

  constructor() {
    this.bucket = process.env.R2_BUCKET_NAME!;
    this.publicUrl = process.env.R2_PUBLIC_URL!.replace(/\/$/, '');

    this.s3 = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT!,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }

  private validateImageMime(mimetype: string) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/jpg'];
    if (!allowed.includes(mimetype)) {
      throw new BadRequestException(
        `Unsupported image type: ${mimetype}. Allowed: ${allowed.join(', ')}`,
      );
    }
  }

  private getExtension(mimetype: string): string {
    const map: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
    };
    return map[mimetype] || 'jpg';
  }

  async uploadImage(
    buffer: Buffer,
    mimetype: string,
    folder: string = 'general',
  ): Promise<{ secureUrl: string; publicId: string }> {
    this.validateImageMime(mimetype);

    const ext = this.getExtension(mimetype);
    const key = `popli/${folder}/${uuidv4()}.${ext}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimetype,
      }),
    );

    return {
      secureUrl: `${this.publicUrl}/${key}`,
      publicId: key,
    };
  }

  async deleteImage(publicId: string): Promise<void> {
    try {
      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: publicId,
        }),
      );
    } catch (error) {
      console.warn(`Failed to delete R2 image: ${publicId}`, error);
    }
  }
}