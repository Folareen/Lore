import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChannelsController } from './channels.controller';
import { ChannelsRepository } from './channels.repository';
@Module({
  imports: [AuthModule],
  controllers: [ChannelsController],
  providers: [ChannelsRepository],
  exports: [ChannelsRepository],
})
export class ChannelsModule {}
