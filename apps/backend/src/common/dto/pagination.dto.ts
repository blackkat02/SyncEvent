import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { PaginationQueryParams } from '@syncevent/shared';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export class PaginationDto extends createZodDto(paginationSchema) implements PaginationQueryParams { }
