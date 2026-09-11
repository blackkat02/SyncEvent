import { Module } from '@nestjs/common';
import { OutboxRelayService } from './outbox-relay.service';

/**
 * Runs the transactional-outbox relay. Depends on the global `KafkaModule`
 * (producer) and `PrismaModule`, so it only needs to register the service.
 */
@Module({
  providers: [OutboxRelayService],
})
export class OutboxModule {}
