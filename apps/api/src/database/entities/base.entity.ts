import { BeforeInsert, PrimaryColumn } from 'typeorm';
import { generateId } from '../../common/id';

/**
 * Shared base for all entities: a text primary key carrying a typed prefix
 * (e.g. `cus_`, `inv_`), assigned app-side before insert. Subclasses declare
 * their prefix via {@link idPrefix}.
 */
export abstract class PrefixedEntity {
  @PrimaryColumn('text')
  id!: string;

  /** Short id prefix for this entity type, e.g. `'cus'`. */
  protected abstract idPrefix(): string;

  @BeforeInsert()
  protected assignId(): void {
    if (!this.id) {
      this.id = generateId(this.idPrefix());
    }
  }
}
