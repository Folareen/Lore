import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { env } from '../config';
import { AuthService } from './auth.service';
import { csrfToken, equalToken } from './auth-crypto';
export interface AuthenticatedRequest extends Request {
  auth: Awaited<ReturnType<AuthService['authenticate']>>;
}
export function cookieValue(
  request: Request,
  name: string,
): string | undefined {
  return request.headers.cookie
    ?.split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
export function assertMutation(request: Request, token: string) {
  const csrf = request.get('x-csrf-token');
  if (
    request.get('origin') !== env.APP_ORIGIN ||
    !csrf ||
    !equalToken(csrf, csrfToken(token))
  )
    throw new ForbiddenException('Invalid request origin or CSRF token');
}
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = cookieValue(request, 'lore_session');
    if (!token) throw new UnauthorizedException('Sign in required');
    request.auth = await this.auth.authenticate(token);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      assertMutation(request, token);
    }
    return true;
  }
}
