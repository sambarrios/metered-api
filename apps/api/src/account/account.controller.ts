import { Controller, Get, NotFoundException, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { CurrentCustomer } from '../auth/current-customer.decorator';
import { Customer } from '../database/entities/customer.entity';

@Controller('v1/me')
@UseGuards(ApiKeyGuard)
export class AccountController {
  constructor(
    @InjectRepository(Customer)
    private readonly customers: Repository<Customer>,
  ) {}

  @Get()
  async me(@CurrentCustomer() customerId: string): Promise<{ id: string; name: string }> {
    const customer = await this.customers.findOne({ where: { id: customerId } });
    if (!customer) throw new NotFoundException();
    return { id: customer.id, name: customer.name };
  }
}
