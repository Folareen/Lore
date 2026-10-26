import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import type { HealthResponse } from '@lore/shared';
import { InfrastructureService } from './infrastructure.service';
@Controller('health')
export class HealthController {
  constructor(private readonly infrastructure: InfrastructureService) {}
  @Get()
  async check(): Promise<HealthResponse> {
    const [postgres, redis] = await Promise.allSettled([
      this.infrastructure.pool.query('SELECT 1'),
      this.infrastructure.redis.ping(),
    ]);
    const healthy =
      postgres.status === 'fulfilled' && redis.status === 'fulfilled';
    const result: HealthResponse = {
      status: healthy ? 'ok' : 'degraded',
      dependencies: {
        postgres: postgres.status === 'fulfilled' ? 'up' : 'down',
        redis: redis.status === 'fulfilled' ? 'up' : 'down',
      },
    };
    if (!healthy) throw new ServiceUnavailableException(result);
    return result;
  }
}
