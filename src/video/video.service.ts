import { Injectable, NotFoundException } from '@nestjs/common';
import Mux from '@mux/mux-node';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VideoService {
  private mux: Mux;

  constructor(private prisma: PrismaService) {
    this.mux = new Mux({
      tokenId: process.env.MUX_TOKEN_ID!,
      tokenSecret: process.env.MUX_TOKEN_SECRET!,
    });
  }

  async createDirectUpload(): Promise<{
    uploadId: string;
    uploadUrl: string;
  }> {
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

  async getAssetFromUpload(uploadId: string): Promise<{
    assetId: string;
    playbackId: string;
    status: string;
    duration: number;
    thumbnailUrl: string;
  }> {
    const upload = await this.mux.video.uploads.retrieve(uploadId);

    if (!upload.asset_id) {
      throw new NotFoundException('Mux asset not ready yet. Poll again.');
    }

    const asset = await this.mux.video.assets.retrieve(upload.asset_id);
    const playbackId = asset.playback_ids?.[0]?.id ?? '';
    const duration = asset.duration ?? 0;
    const thumbnailUrl = playbackId
      ? `https://image.mux.com/${playbackId}/thumbnail.jpg`
      : '';

    return {
      assetId: asset.id,
      playbackId,
      status: asset.status,
      duration,
      thumbnailUrl,
    };
  }

  async deleteAsset(muxAssetId: string): Promise<void> {
    try {
      await this.mux.video.assets.delete(muxAssetId);
    } catch (error) {
      console.warn(`Failed to delete Mux asset: ${muxAssetId}`, error);
    }
  }

  buildPlaybackUrl(playbackId: string): string {
    return `https://stream.mux.com/${playbackId}.m3u8`;
  }
}