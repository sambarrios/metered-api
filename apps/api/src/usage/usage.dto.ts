import { IsISO8601, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../common/dto/pagination.dto';

export class UsageQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}

export interface UsageWindowView {
  windowStart: string;
  totalUnits: number;
  eventCount: number;
  lastEventTs: string | null;
  version: number;
}
