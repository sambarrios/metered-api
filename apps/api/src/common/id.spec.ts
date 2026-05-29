import { generateId } from './id';

describe('generateId', () => {
  it('produces a prefixed id with a base36 body of the requested length', () => {
    const id = generateId('cus');
    expect(id).toMatch(/^cus_[0-9a-z]{20}$/);
  });

  it('honors a custom body length', () => {
    expect(generateId('inv', 8)).toMatch(/^inv_[0-9a-z]{8}$/);
  });

  it('is collision-free across a large batch (random body)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      seen.add(generateId('k'));
    }
    expect(seen.size).toBe(10_000);
  });
});
