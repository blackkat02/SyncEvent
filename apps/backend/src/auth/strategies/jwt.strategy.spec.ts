import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const user = { id: 'user-1', email: 'a@test.dev' };

  let prisma: { user: { findUnique: jest.Mock } };
  let accessTokenBlocklist: { isRevoked: jest.Mock };
  let strategy: JwtStrategy;

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn(async () => user) } };
    accessTokenBlocklist = { isRevoked: jest.fn(async () => false) };
    strategy = new JwtStrategy(prisma as never, accessTokenBlocklist as never);
  });

  it('accepts a token whose jti is not blocklisted', async () => {
    await expect(
      strategy.validate({ sub: user.id, email: user.email, jti: 'jti-1' }),
    ).resolves.toEqual({ id: user.id, email: user.email });
  });

  it('rejects a token whose jti has been blocklisted (Phase 3 logout-everywhere)', async () => {
    accessTokenBlocklist.isRevoked.mockResolvedValueOnce(true);

    await expect(
      strategy.validate({ sub: user.id, email: user.email, jti: 'jti-1' }),
    ).rejects.toThrow(UnauthorizedException);

    // Rejected on the blocklist check alone -- must not even need to hit the
    // database to look the user up.
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('accepts a token with no jti at all without ever calling the blocklist', async () => {
    await expect(
      strategy.validate({ sub: user.id, email: user.email }),
    ).resolves.toEqual({ id: user.id, email: user.email });

    expect(accessTokenBlocklist.isRevoked).not.toHaveBeenCalled();
  });

  it('still rejects when the user no longer exists', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null);

    await expect(
      strategy.validate({ sub: 'ghost', email: 'ghost@test.dev', jti: 'jti-2' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
