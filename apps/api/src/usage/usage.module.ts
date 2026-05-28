import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsageWindow } from '../database/entities/usage-window.entity';
import { UsageController } from './usage.controller';
import { UsageService } from './usage.service';

@Module({
  imports: [TypeOrmModule.forFeature([UsageWindow])],
  controllers: [UsageController],
  providers: [UsageService],
})
export class UsageModule {}
