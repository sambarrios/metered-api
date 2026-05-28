import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsageEvent } from '../database/entities/usage-event.entity';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [TypeOrmModule.forFeature([UsageEvent])],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
