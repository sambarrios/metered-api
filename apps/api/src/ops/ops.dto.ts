import { IsInt, IsOptional, IsString, MinLength, Min } from 'class-validator';

export class CreateCustomerDto {
  @IsString()
  @MinLength(1)
  name!: string;
}

export class CreateApiKeyDto {
  @IsOptional()
  @IsString()
  label?: string;
}

export class IssueCreditDto {
  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsString()
  @MinLength(3)
  reason!: string;

  /** client-generated; UNIQUE in DB -> prevents double-credit on double-click */
  @IsString()
  @MinLength(8)
  idempotencyKey!: string;
}

export class OverrideLineItemDto {
  @IsInt()
  @Min(0)
  amountCents!: number;

  @IsString()
  @MinLength(3)
  reason!: string;
}
