import { ValueTransformer } from 'typeorm';

/**
 * Postgres `bigint` <-> JS `number`. The pg driver returns bigint as a string
 * to avoid silent precision loss; our magnitudes (unit counts) stay well under
 * 2^53, so converting to number is safe and keeps math float-free in cents.
 */
export const bigintTransformer: ValueTransformer = {
  to: (value?: number | null): number | null | undefined => value,
  from: (value?: string | null): number | null =>
    value === null || value === undefined ? null : Number(value),
};
