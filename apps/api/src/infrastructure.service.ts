import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { env } from './config';
@Injectable()
export class InfrastructureService implements OnApplicationShutdown {
  readonly pool = new Pool({
    connectionString: env.DATABASE_URL,
    connectionTimeoutMillis: 2000,
    query_timeout: 2000,
  });
  readonly db = drizzle(this.pool);
  readonly redis = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    commandTimeout: 2000,
    retryStrategy: () => null,
  });
  constructor() {
    this.pool.on('error', () => {
      /* Dependency failures are reported by health checks. */
    });
    this.redis.on('error', () => {
      /* Avoid logging connection credentials. */
    });
  }
  async onApplicationShutdown() {
    this.redis.disconnect();
    await this.pool.end();
  }
}
