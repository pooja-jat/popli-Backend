import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PlatformService } from './platform.service';
import { KafkaProducerService } from '../kafka/kafka-producer.service';

@ApiTags('platform')
@Controller('platform')
export class PlatformController {
  constructor(
    private readonly platformService: PlatformService,
    private readonly kafkaProducer: KafkaProducerService,
  ) {}

  @Get('settings')
  @ApiOperation({ summary: 'Get public platform earning settings' })
  getSettings() {
    return this.platformService.getEarningConfig();
  }

  @Put('settings')
  @ApiOperation({ summary: 'Admin: update earning config and broadcast to all instances' })
  async updateSettings(@Body() body: Record<string, any>) {
    // Persist each key to SystemConfig
    await Promise.all(
      Object.entries(body).map(([key, value]) =>
        this.platformService.upsertConfig(key, value),
      ),
    );

    // Invalidate local memory + Redis cache
    await this.platformService.invalidateEarningConfigCache();

    // Reload fresh config into Redis
    await this.platformService.loadAndCacheEarningConfig();

    // Broadcast to all backend instances via Kafka
    await this.kafkaProducer.publish('platform-settings-updated', [
      { value: JSON.stringify({ updatedAt: new Date().toISOString() }) },
    ]);

    return { success: true };
  }
}