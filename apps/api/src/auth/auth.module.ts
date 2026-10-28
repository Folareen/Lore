import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { TwitchClient } from './twitch.client';
import { SessionGuard } from './session.guard';
@Module({
  controllers: [AuthController],
  providers: [AuthService, TokenService, TwitchClient, SessionGuard],
  exports: [AuthService, SessionGuard, TwitchClient, TokenService],
})
export class AuthModule {}
