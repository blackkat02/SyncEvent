import { Inject, Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject('KAFKA_PRODUCER') private readonly client: ClientKafka,
  ) {}

  async onModuleInit() {
    // Тут можна subscribeToResponseOf() зареєструвати топіки, якщо потрібні відповіді.
    await this.client.connect();
  }

  emit<T = unknown>(topic: string, payload: T) {
    return this.client.emit(topic, payload);
  }

  async onModuleDestroy() {
    await this.client.close();
  }
}
