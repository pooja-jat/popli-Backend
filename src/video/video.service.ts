import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name);

  private readonly accountId = process.env.CLOUDFLARE_ACCOUNT_ID!;
  private readonly apiToken = process.env.CLOUDFLARE_API_TOKEN!;
  private readonly customerSubdomain = process.env.CLOUDFLARE_CUSTOMER_SUBDOMAIN!;
  private readonly webhookSecret = process.env.CLOUDFLARE_WEBHOOK_SECRET!;

  constructor(private prisma: PrismaService) {}

  private get baseUrl() {
    return `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/stream`;
  }

  private get headers() {
    return {
      Authorization: `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json',
    };
  }

async uploadVideoBuffer(buffer: Buffer, mimeType: string): Promise<{
    uploadId: string;
    uploadUrl: string;
    status: string;
    assetId?: string;
    playbackId?: string;
    mediaUrl?: string;
    thumbnailUrl?: string;
    duration?: number;
  }> {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
    formData.append('file', blob, 'video.mp4');

    const response = await fetch(`${this.baseUrl}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Cloudflare video upload failed: ${error}`);
    }

    const data = await response.json() as any;
    const result = data.result;

    const uid = result.uid;

    return {
      uploadId: uid,
      uploadUrl: '',
      status: result.status?.state ?? 'preparing',
      assetId: uid,
    };
  }

  async createDirectUpload(): Promise<{ uploadId: string; uploadUrl: string }> {
    const response = await fetch(`${this.baseUrl}/direct_upload`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        maxDurationSeconds: 300,
        requireSignedURLs: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Cloudflare direct upload creation failed: ${error}`);
    }

    const data = await response.json() as any;
    const result = data.result;

    return {
      uploadId: result.uid,
      uploadUrl: result.uploadURL,
    };
  }
async getAssetByUploadId(uploadId: string): Promise<{
    status: string;
    assetId?: string;
    playbackId?: string;
    mediaUrl?: string;
    thumbnailUrl?: string;
    duration?: number;
  }> {
    const response = await fetch(`${this.baseUrl}/${uploadId}`, {
      method: 'GET',
      headers: this.headers,
    });

    if (!response.ok) {
      return { status: 'waiting' };
    }

    const data = await response.json() as any;
    const result = data.result;

    if (!result || !result.readyToStream || result.status?.state !== 'ready') {
      return { status: result?.status?.state ?? 'preparing' };
    }

    const uid = result.uid;
    const playbackUrl = result.playback?.hls ?? `https://customer-${this.customerSubdomain}.cloudflarestream.com/${uid}/manifest/video.m3u8`;
    const thumbnailUrl = result.thumbnail ?? `https://customer-${this.customerSubdomain}.cloudflarestream.com/${uid}/thumbnails/thumbnail.jpg`;

    return {
      status: 'ready',
      assetId: uid,
      playbackId: uid,
      mediaUrl: playbackUrl,
      thumbnailUrl,
      duration: result.duration > 0 ? result.duration : undefined,
    };
  }
  async deleteAsset(assetId: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/${assetId}`, {
        method: 'DELETE',
        headers: this.headers,
      });

      if (!response.ok) {
        this.logger.warn(`Failed to delete Cloudflare Stream asset ${assetId}: ${response.status}`);
      } else {
        this.logger.log(`Deleted Cloudflare Stream asset: ${assetId}`);
      }
    } catch (err: any) {
      this.logger.warn(`Failed to delete Cloudflare Stream asset ${assetId}: ${err.message}`);
    }
  }

async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    let event: any;
    try {
      event = JSON.parse(rawBody.toString());
    } catch {
      throw new Error('Invalid webhook body');
    }

    if (this.webhookSecret && signature) {
      const hmac = crypto.createHmac('sha256', this.webhookSecret);
      hmac.update(rawBody);
      const expectedSignature = hmac.digest('hex');
      if (signature !== expectedSignature) {
        this.logger.error('Cloudflare webhook signature verification failed');
        throw new Error('Invalid webhook signature');
      }
    }

    this.logger.log(`Cloudflare Stream webhook received for uid: ${event.uid}`);

const uid = event.uid as string;
    if (!uid) return;

    if (event.readyToStream === true && event.status?.state === 'ready') {
      const thumbnailUrl = `https://customer-${this.customerSubdomain}.cloudflarestream.com/${uid}/thumbnails/thumbnail.jpg`;
      const playbackUrl = `https://customer-${this.customerSubdomain}.cloudflarestream.com/${uid}/manifest/video.m3u8`;
      const duration = event.duration as number | undefined;

      await this.prisma.reel.updateMany({
        where: { muxAssetId: uid },
        data: {
          mediaUrl: playbackUrl,
          thumbnailUrl,
          muxPlaybackId: uid,
          durationSeconds: duration ? Math.round(duration) : undefined,
        },
      });

      this.logger.log(`Updated reel for Cloudflare Stream video: ${uid}`);
    }

    if (event.status?.state === 'error') {
      this.logger.error(`Cloudflare Stream video errored: ${uid} — ${event.status?.errorReasonCode}`);
    }
  }
}