import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { EventsModule } from './events/events.module';
import { RedisModule } from './redis/redis.module';
import { KafkaModule } from './kafka/kafka.module';
import { BookingModule } from './booking/booking.module';
import { OutboxModule } from './outbox/outbox.module';
import { ScheduledTasksModule } from './scheduled-tasks/scheduled-tasks.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      expandVariables: true,
    }),

    // Спільне з'єднання для всіх BullMQ-черг (Фаза 1: черга event-booking).
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
    }),

    PrismaModule,
    RedisModule,
    KafkaModule,
    AuthModule,
    EventsModule,
    BookingModule,
    OutboxModule,
    ScheduledTasksModule,
  ],
})
export class AppModule {}
