import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { env } from './config';
import { ApiExceptionFilter } from './api-exception.filter';
import type { Request, Response, NextFunction } from 'express';
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    bodyParser: false,
  });
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.useBodyParser('json', { limit: '100kb' });
  app.use(
    (
      error: unknown,
      _request: Request,
      response: Response,
      next: NextFunction,
    ) => {
      if (
        error instanceof Error &&
        'type' in error &&
        (error.type === 'entity.parse.failed' ||
          error.type === 'entity.too.large')
      ) {
        const status = error.type === 'entity.too.large' ? 413 : 400;
        response.status(status).json({
          statusCode: status,
          message:
            status === 413 ? 'Request body is too large' : 'Invalid JSON body',
        });
      } else next(error);
    },
  );
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
  await app.listen(env.API_PORT, '127.0.0.1');
}
void bootstrap();
