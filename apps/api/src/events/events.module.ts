import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsageEvent } from '../database/entities/usage-event.entity';
import { JobsModule } from '../jobs/jobs.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [TypeOrmModule.forFeature([UsageEvent]), JobsModule],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
