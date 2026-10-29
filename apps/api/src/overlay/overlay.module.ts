import { AuthModule } from '../auth/auth.module';
import { Module } from '@nestjs/common';
import { PublicationsModule } from '../publications/publications.module';
import {
  OverlayController,
  OverlayDisplayController,
} from './overlay.controller';
import { OverlayRepository } from './overlay.repository';
@Module({
  imports: [AuthModule, PublicationsModule],
  controllers: [OverlayController, OverlayDisplayController],
  providers: [OverlayRepository],
})
export class OverlayModule {}
