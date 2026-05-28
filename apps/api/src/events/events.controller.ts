import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { CurrentCustomer } from '../auth/current-customer.decorator';
import { IngestEventsDto, IngestResultDto } from './events.dto';

@Controller('v1/events')
@UseGuards(ApiKeyGuard)
export class EventsController {
  // MOCK: counts the batch and pretends the first one is a duplicate.
  // Phase 3: batch INSERT ... ON CONFLICT (request_id) DO NOTHING, scoped to customerId.
  @Post()
  @HttpCode(202)
  ingest(
    @CurrentCustomer() customerId: string,
    @Body() body: IngestEventsDto,
  ): IngestResultDto {
    void customerId;
    const received = body.events.length;
    const duplicates = received > 1 ? 1 : 0; // MOCK
    return { received, accepted: received - duplicates, duplicates };
  }
}
