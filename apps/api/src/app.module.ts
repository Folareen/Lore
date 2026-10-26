import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { queueNames } from '@lore/shared';
import { env } from './config';
import { InfrastructureService } from './infrastructure.service';
import { HealthController } from './health.controller';
const redis = new URL(env.REDIS_URL);
@Module({
  imports: [
    BullModule.forRoot({
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
    BullModule.registerQueue(
      { name: queueNames.ingestion },
      { name: queueNames.ai },
    ),
  ],
  controllers: [HealthController],
  providers: [InfrastructureService],
})
export class AppModule {}
