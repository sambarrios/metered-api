import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKey } from '../database/entities/api-key.entity';
import { Customer } from '../database/entities/customer.entity';
import { UsageWindow } from '../database/entities/usage-window.entity';
import { InvoicesModule } from '../invoices/invoices.module';
import { OpsCustomersController } from './customers.controller';
import { OpsInvoicesController } from './ops-invoices.controller';
import { CreditsService } from './credits.service';
import { OpsCustomersService } from './ops-customers.service';
import { OpsInvoicesService } from './ops-invoices.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Customer, ApiKey, UsageWindow]),
    InvoicesModule,
  ],
  controllers: [OpsCustomersController, OpsInvoicesController],
  providers: [OpsCustomersService, CreditsService, OpsInvoicesService],
})
export class OpsModule {}
