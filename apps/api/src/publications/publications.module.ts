import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { CommunityAssistantService } from './community-assistant.service';
import { AuthModule } from '../auth/auth.module';
import {
  PublicLoreController,
  PublicationsController,
} from './publications.controller';
import { PublicationsRepository } from './publications.repository';
@Module({
  imports: [AuthModule, AiModule],
  controllers: [PublicationsController, PublicLoreController],
  providers: [PublicationsRepository, CommunityAssistantService],
  exports: [PublicationsRepository],
})
export class PublicationsModule {}
