import './instrument';
import 'dotenv/config';
import * as admin from 'firebase-admin';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { PrismaService } from './prisma/prisma.service';
import { RedisService } from './redis/redis.service';
import { PlatformService } from './platform/platform.service';

async function bootstrap() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  }

const app = await NestFactory.create(AppModule, { rawBody: true });

  app.use(helmet());
 app.use('/wallet/recharge/webhook', require('express').raw({ type: 'application/json' }));
  app.use('/admin/withdrawals/payout-webhook', require('express').raw({ type: 'application/json' }));
app.enableCors({
    origin: [
      'https://popli-admin.onrender.com',
      'http://localhost:8081',
      'http://localhost:3000',
      'http://localhost:5173',
      'https://popli-app.onrender.com'
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Bypass-Tunnel-Reminder'],
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());

  const config = new DocumentBuilder()
    .setTitle('Popli API')
    .setDescription('The Popli backend API documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await syncRedisOnStartup(app);

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}

async function syncRedisOnStartup(app: any) {
const logger = { log: (msg: string) => console.log(`[StartupSync] ${msg}`) };

  try {
    const prisma = app.get(PrismaService);
    const redis = app.get(RedisService);
    const platformService = app.get(PlatformService);

    await platformService.loadAndCacheEarningConfig();
    logger.log('Platform earning config warmed into Redis');

    const viewCounts = await prisma.reelViewCount.findMany({
      select: { reelId: true, totalViews: true },
    });

for (const vc of viewCounts) {
      const key = `reel:view-count:${vc.reelId}`;
      const existing = await redis.get(key);
      const existingVal = existing ? parseInt(existing, 10) : 0;
      const dbVal = Number(vc.totalViews);
      if (dbVal > existingVal) {
        await redis.set(key, dbVal.toString());
      }
    }

    logger.log(`Redis warmed: ${viewCounts.length} reel view counts restored`);
  } catch (err: any) {
    console.error(`[StartupSync] Failed: ${err.message}`);
  }
}

bootstrap();