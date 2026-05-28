import { Module } from '@nestjs/common';
import { OpsCustomersController } from './customers.controller';
import { OpsInvoicesController } from './ops-invoices.controller';

@Module({ controllers: [OpsCustomersController, OpsInvoicesController] })
export class OpsModule {}
