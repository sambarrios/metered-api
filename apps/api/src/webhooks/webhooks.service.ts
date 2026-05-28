import {
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { generateId } from '../common/id';
import { verifyWebhookSignature } from '../common/webhook-signature';
import { PaymentWebhookDto } from './webhooks.controller';

export interface WebhookResult {
  received: true;
  deliveryId: string;
  /** True when this delivery_id was already processed (replay → no-op). */
  deduplicated: boolean;
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  /**
   * Verify the HMAC over the raw body, then process exactly once. The dedupe
   * insert and the invoice state change share one transaction: a redelivered
   * delivery_id collides on the UNIQUE constraint, we detect zero inserted
   * rows, and return a no-op — so 3 deliveries flip the invoice exactly once.
   */
  async process(
    rawBody: Buffer | undefined,
    signature: string | undefined,
    dto: PaymentWebhookDto,
  ): Promise<WebhookResult> {
    const secret = this.config.get<string>('WEBHOOK_SIGNING_SECRET');
    if (!secret) {
      // Misconfiguration, not a client error: fail closed rather than accept
      // unverified payments.
      this.logger.error('WEBHOOK_SIGNING_SECRET is not set; rejecting webhook');
      throw new InternalServerErrorException('webhook verification not configured');
    }
    // Fall back to the parsed body only if the raw buffer is somehow absent;
    // the signature is computed over exactly what the sender serialized.
    const body = rawBody ?? Buffer.from(JSON.stringify(dto));
    if (!verifyWebhookSignature(body, signature, secret)) {
      throw new UnauthorizedException('invalid webhook signature');
    }

    return this.dataSource.transaction(async (em) => {
      const inserted = await em.query<{ id: string }[]>(
        `INSERT INTO payment_events (id, delivery_id, signature, payload, invoice_id, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (delivery_id) DO NOTHING
         RETURNING id`,
        [
          generateId('pe'),
          dto.deliveryId,
          signature ?? null,
          JSON.stringify(dto),
          dto.invoiceId,
          dto.status,
        ],
      );

      if (inserted.length === 0) {
        this.logger.log(`replay of delivery ${dto.deliveryId}; no-op`);
        return { received: true, deliveryId: dto.deliveryId, deduplicated: true };
      }

      await this.applyToInvoice(em, dto);
      await em.query(`UPDATE payment_events SET processed_at = now() WHERE delivery_id = $1`, [
        dto.deliveryId,
      ]);

      return { received: true, deliveryId: dto.deliveryId, deduplicated: false };
    });
  }

  /**
   * A successful payment flips a draft/issued invoice to paid. The transition
   * is idempotent (a second, distinct delivery for an already-paid invoice
   * changes nothing). Failed payments are recorded but don't move the invoice.
   */
  private async applyToInvoice(em: EntityManager, dto: PaymentWebhookDto): Promise<void> {
    if (dto.status !== 'paid') {
      return;
    }
    const updated = await em.query(
      `UPDATE invoices
          SET status = 'paid', paid_at = now()
        WHERE id = $1 AND status IN ('draft', 'issued')
        RETURNING id`,
      [dto.invoiceId],
    );
    if ((updated as unknown[]).length === 0) {
      // Unknown invoice or already paid — recorded for audit, nothing to do.
      this.logger.warn(`payment for invoice ${dto.invoiceId}: no draft/issued invoice to mark paid`);
    } else {
      this.logger.log(`invoice ${dto.invoiceId} marked paid`);
    }
  }
}
