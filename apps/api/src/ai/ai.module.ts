import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { queueNames } from '@lore/shared';
import { AuthModule } from '../auth/auth.module';
import { OpenLoopsModule } from '../open-loops/open-loops.module';
import { AiProvider, GeminiProvider } from './ai.provider';
import { AiRepository } from './ai.repository';
import { AiController } from './ai.controller';
import { AiRecovery, AiWorker } from './ai.worker';
@Module({
  imports: [
    AuthModule,
    OpenLoopsModule,
    BullModule.registerQueue({ name: queueNames.ai }),
  ],
  controllers: [AiController],
  exports: [AiProvider],
  providers: [
    GeminiProvider,
    { provide: AiProvider, useExisting: GeminiProvider },
    AiRepository,
    AiWorker,
    AiRecovery,
  ],
})
export class AiModule {}
