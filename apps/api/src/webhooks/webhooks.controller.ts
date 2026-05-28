import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { IsIn, IsInt, IsString, Min } from 'class-validator';

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
  // MOCK. Phase 3: verify HMAC(signature, raw body, WEBHOOK_SIGNING_SECRET) with
  // constant-time compare; INSERT payment_events (delivery_id UNIQUE) + apply
  // status in one tx; duplicate delivery_id -> 200 no-op (no double effect).
  @Post()
  @HttpCode(200)
  handle(
    @Headers('x-signature') signature: string | undefined,
    @Body() body: PaymentWebhookDto,
  ) {
    void signature;
    return { received: true, deliveryId: body.deliveryId, deduplicated: false };
  }
}
