import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { queueNames } from '@lore/shared';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';
import { CasesRepository } from './cases.repository';
import { CasesController } from './cases.controller';
import { CaseFileStorage, CaseFilesService } from './case-files.service';
import { CaseAiRepository } from './case-ai.repository';
import { CaseAiRecovery, CaseAiWorker } from './case-ai.worker';
@Module({
  imports: [
    AuthModule,
    AiModule,
    BullModule.registerQueue({ name: queueNames.caseAi }),
  ],
  controllers: [CasesController],
  providers: [
    CasesRepository,
    CaseFileStorage,
    CaseFilesService,
    CaseAiRepository,
    CaseAiRecovery,
    CaseAiWorker,
  ],
})
export class CasesModule {}
