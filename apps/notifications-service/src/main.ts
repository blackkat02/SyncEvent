import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.KAFKA,
      options: {
        client: {
          clientId: 'notifications-service',
          brokers: [process.env.KAFKA_BROKER ?? 'localhost:9092'],
          // Survive a cold broker / topics still being created on first connect.
          retry: { retries: 10, initialRetryTime: 500, maxRetryTime: 30000 },
        },
        consumer: {
          groupId: 'notifications-consumer',
          allowAutoTopicCreation: true,
        },
        subscribe: { fromBeginning: false },
      },
    },
  );
  await app.listen();
}
bootstrap();
