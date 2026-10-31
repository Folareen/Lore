import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';
import { OpenLoopsModule } from '../open-loops/open-loops.module';
import { PublicationsModule } from '../publications/publications.module';
import { ContinuityController } from './continuity.controller';
import { ContinuityService } from './continuity.service';
import { ModerationImportsService } from './moderation-imports.service';
@Module({
  imports: [AuthModule, AiModule, OpenLoopsModule, PublicationsModule],
  controllers: [ContinuityController],
  providers: [ContinuityService, ModerationImportsService],
  exports: [ModerationImportsService],
})
export class ContinuityModule {}
