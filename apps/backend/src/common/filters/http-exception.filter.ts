import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    const message =
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      'message' in exceptionResponse
        ? (exceptionResponse as Record<string, unknown>).message
        : exceptionResponse;

    response.status(status).json({
      success: false,
      message:
        typeof message === 'string' || Array.isArray(message)
          ? message
          : 'Internal server error',
      error: exception.name,
      statusCode: status,
      timestamp: new Date().toISOString(),
    });
  }
}
