import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Job } from '../database/entities/job.entity';
import { JobQueueService } from './job-queue.service';

@Module({
  imports: [TypeOrmModule.forFeature([Job])],
  providers: [JobQueueService],
  exports: [JobQueueService],
})
export class JobsModule {}
