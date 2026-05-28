import 'reflect-metadata';
import AppDataSource from '../src/database/data-source';
import { generateApiKey } from '../src/common/api-key';
import { ApiKey } from '../src/database/entities/api-key.entity';
import { Customer } from '../src/database/entities/customer.entity';
import { CustomerPlan } from '../src/database/entities/customer-plan.entity';

/**
 * Dev-only seed: creates one demo customer on the default plan and mints an API
 * key, printing the plaintext once. Use the printed key as `X-API-Key` to
 * exercise /v1. Not a migration — never runs in prod.
 */
async function main(): Promise<void> {
  await AppDataSource.initialize();
  const customers = AppDataSource.getRepository(Customer);
  const plans = AppDataSource.getRepository(CustomerPlan);
  const keys = AppDataSource.getRepository(ApiKey);

  const customer = await customers.save(customers.create({ name: 'Demo Co' }));
  await plans.save(
    plans.create({ customerId: customer.id, planId: 'pp_default', effectiveFrom: new Date() }),
  );
  const { plaintext, keyHash, keyPrefix } = generateApiKey();
  await keys.save(keys.create({ customerId: customer.id, keyHash, keyPrefix }));

  console.log('Seeded customer:', customer.id);
  console.log('API key (shown once):', plaintext);

  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
