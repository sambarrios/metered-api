import { Column, CreateDateColumn, Entity, Index } from 'typeorm';
import { PrefixedEntity } from './base.entity';

@Entity('api_keys')
@Index('idx_api_keys_customer', ['customerId'])
export class ApiKey extends PrefixedEntity {
  protected idPrefix(): string {
    return 'key';
  }

  @Column({ name: 'customer_id', type: 'text' })
  customerId!: string;

  /** sha256 hex of the plaintext key. Plaintext is shown once, never stored. */
  @Column({ name: 'key_hash', type: 'text', unique: true })
  keyHash!: string;

  /** Short non-secret prefix of the plaintext key, for display/lookup. */
  @Column({ name: 'key_prefix', type: 'text' })
  keyPrefix!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;
}
