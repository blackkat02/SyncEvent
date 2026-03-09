import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for frontend
  app.enableCors({
    origin: true,
    credentials: true,
  });

  const port = process.env.PORT ?? 3000;

  await app.listen(port);

  if (process.env.NODE_ENV !== 'production') {
    console.log(`Server running on http://localhost:${port}`);
  }
}

void bootstrap();
