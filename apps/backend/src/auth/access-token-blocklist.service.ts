import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

/**
 * Instant access-token revocation, keyed by jti (design doc §6, Phase 3,
 * optional -- access tokens are otherwise stateless and only expire on
 * their own 15-minute TTL). Only meant for deliberate "kill this session's
 * access right now" actions (e.g. logout-everywhere); ordinary rotation and
 * logout don't touch it, per §0.6.
 */
@Injectable()
export class AccessTokenBlocklistService {
  constructor(private readonly redis: RedisService) {}

  private key(jti: string): string {
    return `blocklist:accessToken:${jti}`;
  }

  async revoke(jti: string, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) return;
    await this.redis.client.set(this.key(jti), '1', 'EX', ttlSeconds);
  }

  async isRevoked(jti: string): Promise<boolean> {
    return (await this.redis.client.exists(this.key(jti))) === 1;
  }
}
