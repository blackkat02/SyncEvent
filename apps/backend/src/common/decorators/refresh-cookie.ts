import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export const RefreshCookie = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string | undefined => {
    const req = ctx.switchToHttp().getRequest<Request>();
    const value: unknown = req.cookies?.['refreshToken'];
    return typeof value === 'string' && value !== '' ? value : undefined;
  },
);
