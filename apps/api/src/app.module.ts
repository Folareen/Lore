import { CasesModule } from './cases/cases.module';
import { PublicationsModule } from './publications/publications.module';
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AiModule } from './ai/ai.module';
import { env } from './config';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { ChannelsModule } from './channels/channels.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { OpenLoopsModule } from './open-loops/open-loops.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { HealthController } from './health.controller';
const redis = new URL(env.REDIS_URL);
@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    ChannelsModule,
    IngestionModule,
    OpenLoopsModule,
    AiModule,
    CasesModule,
    PublicationsModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    BullModule.forRoot({
      prefix: env.QUEUE_PREFIX,
      connection: {
        host: redis.hostname,
        port: Number(redis.port || 6379),
        username: redis.username
          ? decodeURIComponent(redis.username)
          : undefined,
        password: redis.password
          ? decodeURIComponent(redis.password)
          : undefined,
        db: Number(redis.pathname.slice(1) || 0),
        ...(redis.protocol === 'rediss:' ? { tls: {} } : {}),
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    }),
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
