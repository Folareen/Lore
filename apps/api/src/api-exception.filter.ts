import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof HttpException) {
      const body = error.getResponse();
      response
        .status(error.getStatus())
        .json(
          typeof body === 'string'
            ? { statusCode: error.getStatus(), message: body }
            : body,
        );
      return;
    }
    // Never log database query parameters, OAuth callback URLs, or provider response bodies.
    if (
      error instanceof Error &&
      'cause' in error &&
      error.cause instanceof Error &&
      'code' in error.cause &&
      error.cause.code === '23505'
    ) {
      const conflict = new ConflictException(
        'A record with these identifiers already exists',
      );
      response.status(409).json(conflict.getResponse());
      return;
    }
    this.logger.error('Unhandled API failure');
    response
      .status(500)
      .json({ statusCode: 500, message: 'Internal server error' });
  }
}
