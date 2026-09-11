import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { KafkaProducerService } from '../kafka/kafka-producer.service';

/**
 * Polls the `OutboxEvent` table and publishes unsent rows to Kafka
 * (docs/architecture/booking-concurrency.md §6.4). At-least-once: a row is
 * marked `sentAt` only after the broker acks it, so a crash between publish
 * and update just re-publishes — consumers dedupe on `payload.messageId`.
 *
 * Single-instance assumption: with more than one backend replica, swap the
 * plain `findMany` for `SELECT … FOR UPDATE SKIP LOCKED` so replicas don't
 * both grab the same rows (harmless with idempotent consumers, just wasteful).
 */
@Injectable()
export class OutboxRelayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayService.name);
  private timer?: NodeJS.Timeout;
  private stopped = false;
  private ticking = false;

  private static readonly INTERVAL_MS = 1000;
  private static readonly BATCH_SIZE = 50;

  constructor(
    private readonly prisma: PrismaService,
    private readonly kafka: KafkaProducerService,
  ) {}

  onModuleInit() {
    if (process.env.OUTBOX_RELAY_DISABLED === 'true') {
      this.logger.warn('outbox relay disabled via OUTBOX_RELAY_DISABLED');
      return;
    }
    this.scheduleNext();
  }

  onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private scheduleNext() {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      void this.tick().finally(() => this.scheduleNext());
    }, OutboxRelayService.INTERVAL_MS);
  }

  /** One drain pass. Public for unit testing; the scheduler calls it on a timer. */
  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const rows = await this.prisma.outboxEvent.findMany({
        where: { sentAt: null },
        orderBy: { createdAt: 'asc' },
        take: OutboxRelayService.BATCH_SIZE,
      });

      for (const row of rows) {
        try {
          await this.kafka.emit(row.topic, row.payload, row.key);
          await this.prisma.outboxEvent.update({
            where: { id: row.id },
            data: { sentAt: new Date() },
          });
        } catch (err) {
          // Stop the batch here — retry from this row next tick so per-event
          // ordering (createdAt) is preserved even across failures.
          this.logger.error(
            `failed to publish outbox row ${row.id} (${row.topic}): ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
          return;
        }
      }
    } catch (err) {
      this.logger.error(
        `outbox tick failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.ticking = false;
    }
  }
}
