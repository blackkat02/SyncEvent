import { AccessTokenBlocklistService } from './access-token-blocklist.service';

const createRedisMock = () => ({
  client: {
    set: jest.fn(),
    exists: jest.fn(),
  },
});

describe('AccessTokenBlocklistService', () => {
  let redis: ReturnType<typeof createRedisMock>;
  let service: AccessTokenBlocklistService;

  beforeEach(() => {
    redis = createRedisMock();
    service = new AccessTokenBlocklistService(redis as never);
  });

  it('revokes a jti with a TTL', async () => {
    await service.revoke('jti-1', 900);

    expect(redis.client.set).toHaveBeenCalledWith(
      'blocklist:accessToken:jti-1',
      '1',
      'EX',
      900,
    );
  });

  it('does not write anything for a non-positive TTL (already expired by then)', async () => {
    await service.revoke('jti-1', 0);
    await service.revoke('jti-1', -5);

    expect(redis.client.set).not.toHaveBeenCalled();
  });

  it('reports a jti as revoked only once it has actually been set', async () => {
    redis.client.exists.mockResolvedValueOnce(0);
    await expect(service.isRevoked('jti-1')).resolves.toBe(false);

    redis.client.exists.mockResolvedValueOnce(1);
    await expect(service.isRevoked('jti-1')).resolves.toBe(true);

    expect(redis.client.exists).toHaveBeenCalledWith('blocklist:accessToken:jti-1');
  });
});
