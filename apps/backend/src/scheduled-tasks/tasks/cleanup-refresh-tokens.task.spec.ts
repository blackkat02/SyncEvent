import { RevokedReason } from '@prisma/client';
import {
  CleanupRefreshTokensTask,
  OPERATIONAL_MARGIN_MS,
  REUSE_DETECTED_RETENTION_MS,
} from './cleanup-refresh-tokens.task';

/**
 * `PrismaService` is mocked, so `deleteMany` never actually filters rows —
 * these tests instead assert on the exact `where` clause built for it. The
 * three scenario groups from design doc §5.4 (expired / ROTATED+LOGOUT past
 * the operational margin / REUSE_DETECTED past the forensics window) map
 * 1:1 onto the three `OR` branches asserted here: since Postgres applies
 * `lt` boundaries exactly, a correct branch shape is what makes each
 * "within window -> kept, past window -> deleted" pair from §5.4 true, for
 * both revoked reasons the branch covers.
 */

const NOW = new Date('2026-09-14T12:00:00.000Z');

describe('CleanupRefreshTokensTask', () => {
  let prisma: { refreshToken: { deleteMany: jest.Mock } };
  let task: CleanupRefreshTokensTask;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    prisma = { refreshToken: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) } };
    task = new CleanupRefreshTokensTask(prisma as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('deletes rows whose expiresAt is in the past, regardless of revoked state', async () => {
    await task.run();

    const where = prisma.refreshToken.deleteMany.mock.calls[0][0].where;
    expect(where.OR[0]).toEqual({ expiresAt: { lt: NOW } });
  });

  it('deletes ROTATED and LOGOUT rows only once revokedAt is past the 5-minute operational margin', async () => {
    await task.run();

    const where = prisma.refreshToken.deleteMany.mock.calls[0][0].where;
    expect(where.OR[1]).toEqual({
      revoked: true,
      revokedReason: { in: [RevokedReason.ROTATED, RevokedReason.LOGOUT] },
      revokedAt: { lt: new Date(NOW.getTime() - OPERATIONAL_MARGIN_MS) },
    });
  });

  it('deletes REUSE_DETECTED rows only once revokedAt is past the 7-day forensics window', async () => {
    await task.run();

    const where = prisma.refreshToken.deleteMany.mock.calls[0][0].where;
    expect(where.OR[2]).toEqual({
      revoked: true,
      revokedReason: RevokedReason.REUSE_DETECTED,
      revokedAt: { lt: new Date(NOW.getTime() - REUSE_DETECTED_RETENTION_MS) },
    });
  });

  it('never matches an active (not revoked, not expired) row: the query has exactly these 3 branches', async () => {
    await task.run();

    const where = prisma.refreshToken.deleteMany.mock.calls[0][0].where;
    expect(where.OR).toHaveLength(3);
  });

  it('returns the number of rows deleteMany reports deleting', async () => {
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 42 });

    await expect(task.run()).resolves.toBe(42);
  });
});
