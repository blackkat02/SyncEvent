import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EventsModule } from '../events/events.module';
import { EVENT_BOOKING_QUEUE } from './booking.constants';
import { BookingQueueService } from './booking-queue.service';
import { BookingStatusService } from './booking-status.service';
import { BookingProcessor } from './booking.processor';

/**
 * Global so `EventsController` can inject `BookingQueueService` /
 * `BookingStatusService` without `EventsModule` importing this module back
 * (this module already imports `EventsModule` for `EventsService`, and a
 * two-way import would be circular). Mirrors the existing `RedisModule` /
 * `KafkaModule` pattern in this codebase.
 */
@Global()
@Module({
  imports: [BullModule.registerQueue({ name: EVENT_BOOKING_QUEUE }), EventsModule],
  providers: [BookingQueueService, BookingStatusService, BookingProcessor],
  exports: [BookingQueueService, BookingStatusService],
})
export class BookingModule {}
