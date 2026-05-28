import { Body, Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { IsIn, IsInt, IsString, Min } from 'class-validator';
import { RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';
import { WebhooksService, WebhookResult } from './webhooks.service';

export class PaymentWebhookDto {
  /** unique per delivery; dedupe key for replay safety */
  @IsString()
  deliveryId!: string;

  @IsString()
  invoiceId!: string;

  @IsIn(['paid', 'failed'])
  status!: 'paid' | 'failed';

  @IsInt()
  @Min(0)
  amountCents!: number;
}

@Controller('webhooks/payments')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  // Verifies HMAC(x-signature, raw body, WEBHOOK_SIGNING_SECRET) with a
  // constant-time compare, then processes once: payment_events.delivery_id is
  // UNIQUE, so a redelivery is a 200 no-op. Always 200 on a valid signature so
  // the processor stops retrying.
  @Post()
  @HttpCode(200)
  handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-signature') signature: string | undefined,
    @Body() body: PaymentWebhookDto,
  ): Promise<WebhookResult> {
    return this.webhooks.process(req.rawBody, signature, body);
  }
}
