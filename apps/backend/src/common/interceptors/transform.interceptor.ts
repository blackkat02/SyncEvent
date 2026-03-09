import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

interface InternalResponse<T> {
  message?: string;
  result?: T;
}

export interface Response<T> {
  success: boolean;
  message: string;
  data: T;
  timestamp: string;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  Response<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T>> {
    return next.handle().pipe(
      map((data: T | InternalResponse<T>) => {
        const isInternalResponse =
          data !== null &&
          typeof data === 'object' &&
          ('result' in data || 'message' in data);

        const message = isInternalResponse
          ? data.message
          : 'Operation successful';
        const resultData = isInternalResponse ? data.result : data;

        return {
          success: true,
          message: message || 'Operation successful',
          data: resultData as T,
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}
