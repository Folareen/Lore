import { CaseFileStorage } from '../cases/case-files.service';
import { StoryImagesService } from './story-images.service';
import {
  StoryImagesController,
  PublicStoryImagesController,
} from './story-images.controller';
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
  controllers: [
    PublicationsController,
    PublicLoreController,
    StoryImagesController,
    PublicStoryImagesController,
  ],
  providers: [
    PublicationsRepository,
    CommunityAssistantService,
    CaseFileStorage,
    StoryImagesService,
  ],
  exports: [PublicationsRepository],
})
export class PublicationsModule {}
