import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChannelsController } from './channels.controller';
import { ChannelsRepository } from './channels.repository';
import { TwitchModeratorsClient } from './twitch-moderators.client';
@Module({
  imports: [AuthModule],
  controllers: [ChannelsController],
  providers: [ChannelsRepository, TwitchModeratorsClient],
  exports: [ChannelsRepository],
})
export class ChannelsModule {}
