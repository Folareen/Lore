import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { env } from './config';
@Injectable()
export class InfrastructureService implements OnApplicationShutdown {
  readonly pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 15000,
    query_timeout: 15000,
  });
  readonly db = drizzle(this.pool);
  readonly redis = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 10000,
    commandTimeout: 5000,
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
