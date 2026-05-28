import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { CurrentApiKey } from '../auth/current-api-key.decorator';
import { CurrentCustomer } from '../auth/current-customer.decorator';
import { IngestEventsDto, IngestResultDto } from './events.dto';
import { EventsService } from './events.service';

@Controller('v1/events')
@UseGuards(ApiKeyGuard)
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Post()
  @HttpCode(202)
  ingest(
    @CurrentCustomer() customerId: string,
    @CurrentApiKey() apiKeyId: string | null,
    @Body() body: IngestEventsDto,
  ): Promise<IngestResultDto> {
    return this.events.ingest(customerId, apiKeyId, body);
  }
}
