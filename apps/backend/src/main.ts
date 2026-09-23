import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { Logger } from '@nestjs/common';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ZodValidationPipe, cleanupOpenApiDoc } from 'nestjs-zod';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  const config = new DocumentBuilder()
    .setTitle('SyncEvent API')
    .setDescription('The SyncEvent API description')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, cleanupOpenApiDoc(document));

  app.use(cookieParser());

  // Enable CORS for frontend
  const allowedOrigins = process.env.CORS_ORIGINS?.split(',') || [
    'http://localhost:5173', // apps/frontend (Vite)
    'http://localhost:3001', // apps/frontend-next (Next.js dev)
    'http://localhost:3000',
  ];
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  app.useGlobalInterceptors(new TransformInterceptor());

  app.useGlobalFilters(new HttpExceptionFilter(), new PrismaExceptionFilter());

  const port = process.env.PORT ?? 3000;

  app.setGlobalPrefix('api');

  app.useGlobalPipes(new ZodValidationPipe());

  await app.listen(port);

  logger.log(`🚀 Server running on http://localhost:${port}`);
}

void bootstrap();
