import { Injectable, Logger } from '@nestjs/common';
import { RevokedReason } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export const OPERATIONAL_MARGIN_MS = 5 * 60 * 1000;

export const REUSE_DETECTED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class CleanupRefreshTokensTask {
  private readonly logger = new Logger(CleanupRefreshTokensTask.name);

  constructor(private readonly prisma: PrismaService) {}

  async run(): Promise<number> {
    const now = new Date();

    const result = await this.prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: now } },
          {
            revoked: true,
            revokedReason: { in: [RevokedReason.ROTATED, RevokedReason.LOGOUT] },
            revokedAt: { lt: new Date(now.getTime() - OPERATIONAL_MARGIN_MS) },
          },
          {
            revoked: true,
            revokedReason: RevokedReason.REUSE_DETECTED,
            revokedAt: { lt: new Date(now.getTime() - REUSE_DETECTED_RETENTION_MS) },
          },
        ],
      },
    });

    this.logger.log(`deleted ${result.count} expired/stale refresh token row(s)`);
    return result.count;
  }
}
