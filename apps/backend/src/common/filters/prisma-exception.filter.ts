import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { Prisma } from '@prisma/client';

/**
 * Maps Prisma error codes to HTTP statuses and safe, user-facing messages.
 * Codes not listed here fall back to 500 + a server-side log — raw Prisma
 * messages (which can mention table/column names) never reach the client.
 */
const STATUS_BY_CODE: Record<string, HttpStatus> = {
  P2002: HttpStatus.CONFLICT, // unique constraint violation
  P2025: HttpStatus.NOT_FOUND, // record not found (e.g. update/delete target)
  P2024: HttpStatus.SERVICE_UNAVAILABLE, // connection pool timeout
  P2028: HttpStatus.SERVICE_UNAVAILABLE, // transaction API error / timeout
  P2034: HttpStatus.SERVICE_UNAVAILABLE, // write conflict / deadlock
};

const MESSAGE_BY_CODE: Record<string, string> = {
  P2002: 'A record with this value already exists.',
  P2025: 'Record not found.',
  P2024: 'The database is busy, please try again.',
  P2028: 'The operation timed out, please try again.',
  P2034: 'The operation could not complete due to a conflict, please try again.',
};

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = STATUS_BY_CODE[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;
    const message = MESSAGE_BY_CODE[exception.code] ?? 'Internal server error.';

    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `Unhandled Prisma error ${exception.code}: ${exception.message}`,
        exception.stack,
      );
    }

    response.status(status).json({
      success: false,
      message,
      error: exception.name,
      statusCode: status,
      timestamp: new Date().toISOString(),
    });
  }
}
