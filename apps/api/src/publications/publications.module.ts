import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import {
  PublicLoreController,
  PublicationsController,
} from './publications.controller';
import { PublicationsRepository } from './publications.repository';
@Module({
  imports: [AuthModule],
  controllers: [PublicationsController, PublicLoreController],
  providers: [PublicationsRepository],
  exports: [PublicationsRepository],
})
export class PublicationsModule {}
