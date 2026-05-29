import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from '../database/entities/customer.entity';
import { AccountController } from './account.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Customer])],
  controllers: [AccountController],
})
export class AccountModule {}
