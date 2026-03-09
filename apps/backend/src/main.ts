import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { Logger } from '@nestjs/common';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  // Enable CORS for frontend
  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.useGlobalInterceptors(new TransformInterceptor());

  app.useGlobalFilters(new HttpExceptionFilter());

  const port = process.env.PORT ?? 3000;

  await app.listen(port);

  if (process.env.NODE_ENV !== 'production') {
    console.log(`Server running on http://localhost:${port}`);
  }

  logger.log(`🚀 Server running on http://localhost:${port}`);
}

void bootstrap();
