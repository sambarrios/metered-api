import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Cursor-style is preferred at scale (see DESIGN.md); offset paging for v1 simplicity. */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;
}

export interface Page<T> {
  data: T[];
  page: { limit: number; offset: number; total: number };
}
