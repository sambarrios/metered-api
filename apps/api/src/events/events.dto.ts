import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class UsageEventDto {
  /** globally unique; dedupe key for idempotent ingestion */
  @IsString()
  requestId!: string;

  @IsOptional()
  @IsString()
  apiKeyId?: string;

  @IsString()
  endpoint!: string;

  @IsInt()
  @Min(0)
  units!: number;

  /** event time (may be late / out of order) */
  @IsISO8601()
  timestamp!: string;
}

export class IngestEventsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => UsageEventDto)
  events!: UsageEventDto[];
}

export interface IngestResultDto {
  received: number;
  accepted: number;
  duplicates: number;
}
