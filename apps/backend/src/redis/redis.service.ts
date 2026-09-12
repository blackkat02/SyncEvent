import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  public readonly client: Redis;

  constructor() {
    this.client = new Redis({
      host: process.env.REDIS_HOST ?? 'localhost',
      port: Number(process.env.REDIS_PORT ?? 6379),
      maxRetriesPerRequest: 3,
    });

    this.client.on('error', (err) => {
      this.logger.error(`Redis connection error: ${err.message}`);
    });
  }

  async acquireLock(key: string, ttlMs = 5000): Promise<string | null> {
    const token = randomUUID();
    const result = await this.client.set(key, token, 'PX', ttlMs, 'NX');
    return result === 'OK' ? token : null;
  }

  async releaseLock(key: string, token: string): Promise<void> {
    const luaScript = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    await this.client.eval(luaScript, 1, key, token);
  }

  /**
   * Atomically claims `key` with `value` unless it's already held, via
   * `SET key value EX ttlSeconds NX GET` (Redis >= 6.2's combined form).
   * Returns `null` when the claim succeeded (key was absent and is now set);
   * returns the *existing* value when someone else already holds it, so the
   * caller can piggyback on whatever they claimed instead of overwriting it.
   */
  async setIfAbsent(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<string | null> {
    return this.client.set(key, value, 'EX', ttlSeconds, 'NX', 'GET');
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}
