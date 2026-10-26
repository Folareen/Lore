import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { env } from './config';
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  await app.listen(env.API_PORT, '127.0.0.1');
}
void bootstrap();
