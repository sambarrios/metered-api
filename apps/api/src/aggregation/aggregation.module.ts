import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { AggregationService } from './aggregation.service';
import { AggregationWorker } from './aggregation.worker';

@Module({
  imports: [JobsModule],
  providers: [AggregationService, AggregationWorker],
  exports: [AggregationService],
})
export class AggregationModule {}
