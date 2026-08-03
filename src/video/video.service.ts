import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import Mux from '@mux/mux-node';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name);
  private mux: Mux;

  constructor(private prisma: PrismaService) {
    this.mux = new Mux({
      tokenId: process.env.MUX_TOKEN_ID!,
      tokenSecret: process.env.MUX_TOKEN_SECRET!,
    });
  }

  async createDirectUpload(): Promise<{ uploadId: string; uploadUrl: string }> {
    const upload = await this.mux.video.uploads.create({
      cors_origin: '*',
      new_asset_settings: {
        playback_policy: ['public'],
        mp4_support: 'none',
      },
    });

    return {
      uploadId: upload.id,
      uploadUrl: upload.url,
    };
  }

  async getAssetByUploadId(uploadId: string): Promise<{
    status: string;
    assetId?: string;
    playbackId?: string;
    thumbnailUrl?: string;
    duration?: number;
  }> {
    const upload = await this.mux.video.uploads.retrieve(uploadId);

    if (!upload.asset_id) {
      return { status: 'waiting' };
    }

    const asset = await this.mux.video.assets.retrieve(upload.asset_id);

    if (asset.status !== 'ready') {
      return { status: asset.status ?? 'preparing' };
    }

    const playbackId = asset.playback_ids?.[0]?.id;
    const thumbnailUrl = playbackId
      ? `https://image.mux.com/${playbackId}/thumbnail.jpg`
      : undefined;

    return {
      status: 'ready',
      assetId: asset.id,
      playbackId,
      thumbnailUrl,
      duration: asset.duration,
    };
  }

  async deleteAsset(muxAssetId: string): Promise<void> {
    try {
      await this.mux.video.assets.delete(muxAssetId);
      this.logger.log(`Deleted Mux asset: ${muxAssetId}`);
    } catch (err: any) {
      this.logger.warn(`Failed to delete Mux asset ${muxAssetId}: ${err.message}`);
    }
  }

  async handleWebhook(rawBody: Buffer, muxSignature: string): Promise<void> {
    let event: any;

    try {
      event = this.mux.webhooks.unwrap(rawBody, muxSignature, process.env.MUX_WEBHOOK_SECRET!);
    } catch (err) {
      this.logger.error('Mux webhook signature verification failed');
      throw err;
    }

    this.logger.log(`Mux webhook received: ${event.type}`);

    if (event.type === 'video.asset.ready') {
      const assetId = event.data?.id as string;
      const playbackId = event.data?.playback_ids?.[0]?.id as string | undefined;
      const duration = event.data?.duration as number | undefined;

      if (!assetId || !playbackId) return;

      const thumbnailUrl = `https://image.mux.com/${playbackId}/thumbnail.jpg`;
      const playbackUrl = `https://stream.mux.com/${playbackId}.m3u8`;

      await this.prisma.reel.updateMany({
        where: { muxAssetId: assetId },
        data: {
          mediaUrl: playbackUrl,
          thumbnailUrl,
          muxPlaybackId: playbackId,
          durationSeconds: duration ? Math.round(duration) : undefined,
        },
      });

      this.logger.log(`Updated reel for Mux asset: ${assetId}`);
    }

    if (event.type === 'video.asset.errored') {
      const assetId = event.data?.id as string;
      this.logger.error(`Mux asset errored: ${assetId}`);
    }
  }
}