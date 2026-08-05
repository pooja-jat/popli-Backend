import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { Kafka, Producer, CompressionTypes } from 'kafkajs';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProducerService.name);
 private producer!: Producer;

  onModuleInit() {
    const caPath = path.resolve(process.cwd(), process.env.KAFKA_CA_PATH || './ca.pem');
    const ssl = fs.existsSync(caPath)
      ? { ca: [fs.readFileSync(caPath, 'utf-8')] }
      : true;

    const kafka = new Kafka({
      clientId: 'popli-backend',
      brokers: [process.env.KAFKA_BROKER!],
      ssl,
      sasl: { 
        mechanism: 'plain',
        username: process.env.KAFKA_USERNAME!,
        password: process.env.KAFKA_PASSWORD!,
      },
    });

    this.producer = kafka.producer();
    this.producer.connect()
      .then(() => this.logger.log('Kafka producer connected'))
      .catch((err) => this.logger.error('Kafka producer connection failed', err));
  }

  async onModuleDestroy() {
    await this.producer?.disconnect();
  }

  async publish(topic: string, messages: { key?: string; value: string }[]): Promise<void> {
    try {
      await this.producer.send({
        topic,
        compression: CompressionTypes.None,
        messages,
      });
    } catch (err: any) {
      this.logger.error(`Failed to publish to topic ${topic}: ${err.message}`);
      throw err;
    }
  }
}