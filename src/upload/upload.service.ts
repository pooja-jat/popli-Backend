import { Injectable, BadRequestException } from '@nestjs/common';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

@Injectable()
export class UploadService {
  private s3: S3Client;
  private bucket: string;
  private publicUrl: string;

  constructor() {
    this.bucket = process.env.R2_BUCKET_NAME!;
    this.publicUrl = process.env.R2_PUBLIC_URL!;

    this.s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }

  private validateImageMime(contentType: string) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/jpg'];
    if (!allowed.includes(contentType)) {
      throw new BadRequestException(`Unsupported image type: ${contentType}. Allowed: ${allowed.join(', ')}`);
    }
  }

  private buildObjectKey(folder: string, filename: string): string {
    return `${folder}/${randomUUID()}-${filename}`;
  }

  async getPresignedUploadUrl(folder: string, filename: string, contentType: string): Promise<{
    uploadUrl: string;
    objectKey: string;
    publicUrl: string;
  }> {
    this.validateImageMime(contentType);

    const objectKey = this.buildObjectKey(folder, filename);

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: 300 });

    return {
      uploadUrl,
      objectKey,
      publicUrl: `${this.publicUrl}/${objectKey}`,
    };
  }

  async deleteObject(objectKey: string): Promise<void> {
    try {
      await this.s3.send(new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
      }));
    } catch (error) {
      console.warn(`Failed to delete R2 object: ${objectKey}`, error);
    }
  }
}