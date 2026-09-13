import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService, GRACE_PERIOD_MS, ACCESS_TOKEN_TTL_SECONDS } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { AccessTokenBlocklistService } from './access-token-blocklist.service';

interface FakeRefreshTokenRow {
  id: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  revoked: boolean;
  supersededAt: Date | null;
  supersededById: string | null;
  accessJti: string | null;
}

// Minimal in-memory stand-in for the `refreshToken` Prisma model, just
// enough of create/findFirst/findMany/findUnique/update/updateMany to
// exercise the rotation + reuse-detection + grace-period logic in
// AuthService without a real database.
function createFakeRefreshTokenModel() {
  const rows: FakeRefreshTokenRow[] = [];
  let nextId = 1;

  function matches(row: FakeRefreshTokenRow, where: Partial<FakeRefreshTokenRow>) {
    return (Object.keys(where) as (keyof FakeRefreshTokenRow)[]).every(
      (key) => row[key] === where[key],
    );
  }

  return {
    rows,
    create: jest.fn(
      async ({
        data,
      }: {
        data: Partial<FakeRefreshTokenRow> &
          Pick<FakeRefreshTokenRow, 'userId' | 'tokenHash' | 'familyId'>;
      }) => {
        const row: FakeRefreshTokenRow = {
          id: `rt-${nextId++}`,
          revoked: false,
          supersededAt: null,
          supersededById: null,
          accessJti: null,
          ...data,
        };
        rows.push(row);
        return row;
      },
    ),
    findFirst: jest.fn(async ({ where }: { where: Partial<FakeRefreshTokenRow> }) => {
      return rows.find((row) => matches(row, where)) ?? null;
    }),
    findMany: jest.fn(async ({ where }: { where: Partial<FakeRefreshTokenRow> }) => {
      return rows.filter((row) => matches(row, where));
    }),
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
      return rows.find((row) => row.id === where.id) ?? null;
    }),
    update: jest.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<FakeRefreshTokenRow>;
      }) => {
        const row = rows.find((r) => r.id === where.id);
        if (!row) throw new Error(`row ${where.id} not found`);
        Object.assign(row, data);
        return row;
      },
    ),
    updateMany: jest.fn(
      async ({
        where,
        data,
      }: {
        where: Partial<FakeRefreshTokenRow>;
        data: Partial<FakeRefreshTokenRow>;
      }) => {
        const matched = rows.filter((row) => matches(row, where));
        matched.forEach((row) => Object.assign(row, data));
        return { count: matched.length };
      },
    ),
    delete: jest.fn(async ({ where }: { where: { id: string } }) => {
      const index = rows.findIndex((r) => r.id === where.id);
      if (index === -1) throw new Error(`row ${where.id} not found`);
      const [row] = rows.splice(index, 1);
      return row;
    }),
  };
}

describe('AuthService', () => {
  const PLAIN_PASSWORD = 'correct horse battery staple';
  const user = {
    id: 'user-1',
    email: 'multi-device@test.dev',
    password: '',
    displayName: null as string | null,
    avatarUrl: null as string | null,
  };

  let service: AuthService;
  let refreshTokenModel: ReturnType<typeof createFakeRefreshTokenModel>;
  let accessTokenBlocklist: { revoke: jest.Mock; isRevoked: jest.Mock };

  beforeAll(async () => {
    // Low cost factor: only test speed matters here, not real security.
    user.password = await bcrypt.hash(PLAIN_PASSWORD, 4);
  });

  beforeEach(async () => {
    refreshTokenModel = createFakeRefreshTokenModel();
    accessTokenBlocklist = { revoke: jest.fn(), isRevoked: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              create: jest.fn(),
              findUnique: jest.fn(async () => user),
            },
            refreshToken: refreshTokenModel,
          },
        },
        {
          provide: JwtService,
          useValue: {
            // Unique per call, and unique *early* in the string: bcrypt only
            // hashes the first 72 bytes of its input, and two refresh tokens
            // for the same family share an identical JSON prefix (same
            // familyId/sub/email) — a trailing random suffix would land past
            // that limit and make bcrypt.compare wrongly treat them as equal.
            signAsync: jest.fn(
              async (payload: Record<string, unknown>) =>
                `${Math.random()}:signed:${JSON.stringify(payload)}`,
            ),
          },
        },
        { provide: AccessTokenBlocklistService, useValue: accessTokenBlocklist },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // Extracts familyId from a raw fake refresh token (see the signAsync mock
  // above) so tests can identify "whose session is this" without relying on
  // refreshTokenModel.rows insertion order -- under Promise.all, two
  // concurrent logins' internal bcrypt.hash calls can settle in either
  // order, so the *order rows land in the array* does not necessarily match
  // the order the login() promises were passed in.
  function familyIdOf(rawToken: string): string {
    const match = rawToken.match(/signed:({.*})$/);
    if (!match) throw new Error(`unexpected fake token format: ${rawToken}`);
    const payload = JSON.parse(match[1]) as { familyId?: string };
    if (!payload.familyId) throw new Error('token has no familyId (is this an access token?)');
    return payload.familyId;
  }

  describe('multi-session refresh tokens (Phase 0)', () => {
    const loginDto: RegisterDto = { email: user.email, password: PLAIN_PASSWORD };

    it('gives each device/login its own session — parallel logins do not clobber each other', async () => {
      const [deviceA, deviceB] = await Promise.all([
        service.login(loginDto),
        service.login(loginDto),
      ]);

      expect(refreshTokenModel.rows).toHaveLength(2);
      const familyA = familyIdOf(deviceA.refreshToken);
      const familyB = familyIdOf(deviceB.refreshToken);
      expect(familyA).not.toBe(familyB);

      const rowA = refreshTokenModel.rows.find((r) => r.familyId === familyA);
      const rowB = refreshTokenModel.rows.find((r) => r.familyId === familyB);
      expect(rowA?.revoked).toBe(false);
      expect(rowB?.revoked).toBe(false);

      // Refreshing device A's session must leave device B's untouched.
      await service.refreshTokens(user.id, deviceA.refreshToken, familyA);

      const rowBStillActive = refreshTokenModel.rows.find(
        (r) => r.id === rowB!.id && !r.revoked,
      );
      expect(rowBStillActive).toBeDefined();
    });

    it('rotates on refresh: old row is revoked and its raw token can no longer be used', async () => {
      const { refreshToken: rawV1 } = await service.login(loginDto);
      const [rowV1] = refreshTokenModel.rows;
      const { familyId } = rowV1;

      const { refreshToken: rawV2 } = await service.refreshTokens(
        user.id,
        rawV1,
        familyId,
      );

      expect(rowV1.revoked).toBe(true);
      const activeRow = refreshTokenModel.rows.find(
        (r) => r.familyId === familyId && !r.revoked,
      );
      expect(activeRow).toBeDefined();
      expect(activeRow?.id).not.toBe(rowV1.id);
      expect(rawV2).toBeDefined();
      // Re-presenting rawV1 here is exactly the reuse-detection scenario --
      // covered separately below, including what it does to rawV2.
    });

    it('rejects a refresh token presented against a different session family', async () => {
      const { refreshToken: rawA } = await service.login(loginDto);
      await service.login(loginDto); // device B
      const [rowA, rowB] = refreshTokenModel.rows;
      expect(rowA.familyId).not.toBe(rowB.familyId);

      await expect(
        service.refreshTokens(user.id, rawA, rowB.familyId),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects refresh when no active session exists for the family', async () => {
      await expect(
        service.refreshTokens(user.id, 'whatever', 'nonexistent-family'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout & reuse-detection (Phase 1)', () => {
    const loginDto: RegisterDto = { email: user.email, password: PLAIN_PASSWORD };

    it('logout revokes the session; the old cookie from another tab can no longer refresh', async () => {
      const { refreshToken: raw } = await service.login(loginDto);
      const familyId = familyIdOf(raw);

      await service.logout(user.id, familyId);

      const activeRow = refreshTokenModel.rows.find(
        (r) => r.familyId === familyId && !r.revoked,
      );
      expect(activeRow).toBeUndefined();

      await expect(
        service.refreshTokens(user.id, raw, familyId),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('logout is idempotent -- repeating it, or calling it for an unknown family, does not throw', async () => {
      const { refreshToken: raw } = await service.login(loginDto);
      const familyId = familyIdOf(raw);

      await service.logout(user.id, familyId);
      await expect(service.logout(user.id, familyId)).resolves.toBeUndefined();
      await expect(
        service.logout(user.id, 'nonexistent-family'),
      ).resolves.toBeUndefined();
    });

    // Rewinds a just-superseded row's `supersededAt` so it reads as outside
    // the Phase 2 grace period (see the "grace period" describe block below
    // for what happens to a reuse attempt *within* the window).
    function expireGracePeriod(familyId: string) {
      const supersededRow = refreshTokenModel.rows.find(
        (r) => r.familyId === familyId && r.revoked && r.supersededAt,
      );
      if (!supersededRow) throw new Error('no superseded row found to expire');
      supersededRow.supersededAt = new Date(Date.now() - GRACE_PERIOD_MS - 1000);
    }

    it('detects reuse of an already-rotated-away token (outside the grace period) and kills the whole session chain', async () => {
      const { refreshToken: rawV1 } = await service.login(loginDto);
      const familyId = familyIdOf(rawV1);

      const { refreshToken: rawV2 } = await service.refreshTokens(
        user.id,
        rawV1,
        familyId,
      );
      expireGracePeriod(familyId);

      // rawV1 was already rotated away by the call above -- presenting it
      // again is reuse, not a normal stale-token rejection.
      await expect(
        service.refreshTokens(user.id, rawV1, familyId),
      ).rejects.toThrow(UnauthorizedException);

      // The whole chain is now dead -- including rawV2, which was otherwise
      // still a legitimate, unused token. This is the accepted trade-off for
      // reuse detected outside the grace window (§5): within the window,
      // see the grace-period tests below instead.
      const anyActive = refreshTokenModel.rows.find(
        (r) => r.familyId === familyId && !r.revoked,
      );
      expect(anyActive).toBeUndefined();

      await expect(
        service.refreshTokens(user.id, rawV2, familyId),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('does not touch other sessions/families when detecting reuse in one of them', async () => {
      const { refreshToken: rawA1 } = await service.login(loginDto); // device A
      const { refreshToken: rawB } = await service.login(loginDto); // device B
      const familyA = familyIdOf(rawA1);
      const familyB = familyIdOf(rawB);

      await service.refreshTokens(user.id, rawA1, familyA); // rotates A -> A2
      expireGracePeriod(familyA);

      await expect(
        service.refreshTokens(user.id, rawA1, familyA), // reuse on A
      ).rejects.toThrow(UnauthorizedException);

      const rowBActive = refreshTokenModel.rows.find(
        (r) => r.familyId === familyB && !r.revoked,
      );
      expect(rowBActive).toBeDefined();
      await expect(
        service.refreshTokens(user.id, rawB, familyB),
      ).resolves.toBeDefined();
    });
  });

  describe('anti-race grace period (Phase 2, §5.2)', () => {
    const loginDto: RegisterDto = { email: user.email, password: PLAIN_PASSWORD };

    it('re-issues fresh tokens instead of reuse-detection when a just-superseded token is retried within the grace period', async () => {
      const { refreshToken: rawV1 } = await service.login(loginDto);
      const familyId = familyIdOf(rawV1);

      const { refreshToken: rawV2 } = await service.refreshTokens(
        user.id,
        rawV1,
        familyId,
      );

      // Simulates a second, slower/racing request that read the same stale
      // access token as the one that won and rotated first (§5's scenario).
      const retry = await service.refreshTokens(user.id, rawV1, familyId);
      expect(retry.accessToken).toBeDefined();
      expect(retry.refreshToken).toBeDefined();

      // No new rotation, no reuse-kill -- still exactly one live row for
      // the family.
      const activeRows = refreshTokenModel.rows.filter(
        (r) => r.familyId === familyId && !r.revoked,
      );
      expect(activeRows).toHaveLength(1);

      // rawV2 is now stale (the live row's hash was updated in place to the
      // retry's token) -- an accepted trade-off of re-issuing in place
      // rather than tracking several simultaneously-valid tokens.
      await expect(
        service.refreshTokens(user.id, rawV2, familyId),
      ).rejects.toThrow(UnauthorizedException);

      // But the token the grace path actually handed back works normally.
      const afterRetry = await service.refreshTokens(
        user.id,
        retry.refreshToken,
        familyId,
      );
      expect(afterRetry.accessToken).toBeDefined();
    });
  });

  describe('true concurrency: N parallel refreshes racing the same token (Phase 2 integration)', () => {
    const loginDto: RegisterDto = { email: user.email, password: PLAIN_PASSWORD };

    it('never forks the family into two live sessions and never permanently locks the user out', async () => {
      const { refreshToken: rawV1 } = await service.login(loginDto);
      const familyId = familyIdOf(rawV1);

      const CONCURRENT_REQUESTS = 5;
      const outcomes = await Promise.allSettled(
        Array.from({ length: CONCURRENT_REQUESTS }, () =>
          service.refreshTokens(user.id, rawV1, familyId),
        ),
      );

      const fulfilled = outcomes.filter(
        (o): o is PromiseFulfilledResult<Awaited<ReturnType<typeof service.refreshTokens>>> =>
          o.status === 'fulfilled',
      );
      expect(fulfilled.length).toBeGreaterThanOrEqual(1);

      // Invariant the whole reuse-detection model relies on: at most one
      // live row per family. If more than one of these concurrent requests
      // won its own rotation, the family has forked into two independently
      // "current" sessions.
      const activeRows = refreshTokenModel.rows.filter(
        (r) => r.familyId === familyId && !r.revoked,
      );
      expect(activeRows).toHaveLength(1);

      // Whichever one of these actually represents the live session, using
      // it must still work -- the user must not have been locked out by the
      // race.
      const liveRow = activeRows[0];
      const winner = fulfilled.find(
        (f) =>
          bcrypt.compareSync(f.value.refreshToken, liveRow.tokenHash),
      );
      expect(winner).toBeDefined();
      await expect(
        service.refreshTokens(user.id, winner!.value.refreshToken, familyId),
      ).resolves.toBeDefined();
    });
  });

  describe('logoutAllDevices (Phase 3, optional, §6)', () => {
    const loginDto: RegisterDto = { email: user.email, password: PLAIN_PASSWORD };

    it('revokes every live session for the user and blocklists each one\'s access-token jti', async () => {
      const { refreshToken: rawA } = await service.login(loginDto); // device A
      const { refreshToken: rawB } = await service.login(loginDto); // device B
      const familyA = familyIdOf(rawA);
      const familyB = familyIdOf(rawB);

      await service.logoutAllDevices(user.id);

      const stillLive = refreshTokenModel.rows.filter((r) => !r.revoked);
      expect(stillLive).toHaveLength(0);

      // Both sessions were live at the time of the call, so both of their
      // access-token jtis must have been blocklisted -- not just one.
      const rowA = refreshTokenModel.rows.find((r) => r.familyId === familyA)!;
      const rowB = refreshTokenModel.rows.find((r) => r.familyId === familyB)!;
      expect(accessTokenBlocklist.revoke).toHaveBeenCalledWith(
        rowA.accessJti,
        ACCESS_TOKEN_TTL_SECONDS,
      );
      expect(accessTokenBlocklist.revoke).toHaveBeenCalledWith(
        rowB.accessJti,
        ACCESS_TOKEN_TTL_SECONDS,
      );
      expect(accessTokenBlocklist.revoke).toHaveBeenCalledTimes(2);

      // And the refresh chain is actually dead, not just the access tokens.
      await expect(
        service.refreshTokens(user.id, rawA, familyA),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('is a no-op (no throw, nothing to blocklist) when the user has no live sessions', async () => {
      await expect(service.logoutAllDevices(user.id)).resolves.toBeUndefined();
      expect(accessTokenBlocklist.revoke).not.toHaveBeenCalled();
    });
  });
});
