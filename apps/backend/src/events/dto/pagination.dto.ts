import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Сторінка має бути цілим числом' })
  @Min(1, { message: 'Мінімальна сторінка — 1' })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Ліміт має бути цілим числом' })
  @Min(1)
  @Max(100, { message: 'Максимальний ліміт — 100 записів' })
  limit?: number = 10;
}