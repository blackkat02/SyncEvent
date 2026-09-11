import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProducerService.name);

  constructor(
    @Inject('KAFKA_PRODUCER') private readonly client: ClientKafka,
  ) {}

  async onModuleInit() {
    // Don't let a cold broker block backend boot — bookings must work even
    // when Kafka is down (§8). kafkajs retries on the first emit anyway.
    try {
      await this.client.connect();
    } catch (err) {
      this.logger.warn(
        `Kafka producer not connected at boot (${
          err instanceof Error ? err.message : String(err)
        }); will retry on first publish`,
      );
    }
  }

  /**
   * Publishes a domain event. `key` sets the Kafka partition key — always the
   * eventId, so all events for one event land on the same partition and keep
   * their relative order (a `user-left` can't overtake a `user-joined`).
   *
   * Returns a promise that resolves once the broker has acked the message,
   * so the outbox relay only stamps `sentAt` on a real success.
   */
  async emit<T = unknown>(topic: string, payload: T, key?: string): Promise<void> {
    const message =
      key !== undefined ? { key, value: payload } : { value: payload };
    await lastValueFrom(this.client.emit(topic, message));
  }

  async onModuleDestroy() {
    await this.client.close();
  }
}
