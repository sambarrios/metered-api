import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKey } from '../database/entities/api-key.entity';
import { ApiKeyGuard } from './api-key.guard';
import { StaffGuard } from './staff.guard';

/**
 * Global so `@UseGuards(ApiKeyGuard | StaffGuard)` resolves in every module
 * without each one re-importing the guard's deps (the ApiKey repository).
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ApiKey])],
  providers: [ApiKeyGuard, StaffGuard],
  // Re-export TypeOrmModule so the ApiKey repository is globally resolvable:
  // Nest constructs `@UseGuards(ApiKeyGuard)` in each consuming module's context.
  exports: [ApiKeyGuard, StaffGuard, TypeOrmModule],
})
export class AuthModule {}
