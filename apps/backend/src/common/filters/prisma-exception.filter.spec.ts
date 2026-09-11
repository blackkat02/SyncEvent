import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaExceptionFilter } from './prisma-exception.filter';

/**
 * Unit tests for {@link PrismaExceptionFilter}.
 *
 * Verifies the code -> status/message mapping without a real HTTP server:
 * `ArgumentsHost` is a hand-rolled mock exposing just enough of the Express
 * response surface (`status().json()`) for the filter to call.
 */

const createHostMock = () => {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const response = { status };

  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;

  return { host, status, json };
};

const makePrismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('boom', {
    code,
    clientVersion: '6.0.0',
  });

describe('PrismaExceptionFilter', () => {
  let filter: PrismaExceptionFilter;

  beforeEach(() => {
    filter = new PrismaExceptionFilter();
  });

  it('maps P2002 (unique constraint) to 409', () => {
    const { host, status, json } = createHostMock();

    filter.catch(makePrismaError('P2002'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: HttpStatus.CONFLICT,
        message: 'A record with this value already exists.',
      }),
    );
  });

  it('maps P2025 (record not found) to 404', () => {
    const { host, status } = createHostMock();

    filter.catch(makePrismaError('P2025'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
  });

  it.each(['P2024', 'P2028', 'P2034'])(
    'maps %s to 503 (transient DB contention)',
    (code) => {
      const { host, status } = createHostMock();

      filter.catch(makePrismaError(code), host);

      expect(status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    },
  );

  it('falls back to 500 with a generic message for unmapped codes', () => {
    const { host, status, json } = createHostMock();

    filter.catch(makePrismaError('P2003'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error.',
      }),
    );
  });

  it('never leaks the raw Prisma error message to the client', () => {
    const { host, json } = createHostMock();

    filter.catch(makePrismaError('P2003'), host);

    const body = json.mock.calls[0][0] as { message: string };
    expect(body.message).not.toContain('boom');
  });
});
