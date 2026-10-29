import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { queueNames } from '@lore/shared';
import { AuthModule } from '../auth/auth.module';
import { PublicationsModule } from '../publications/publications.module';
import { CatchupWorker, CatchupRecovery, catchupQueue } from './catchup.worker';
import { OpenLoopsModule } from '../open-loops/open-loops.module';
import {
  EventsubController,
  EventsubWebhookController,
} from './eventsub.controller';
import { EventsubRepository } from './eventsub.repository';
import { EventsubClient } from './eventsub.client';
import { EventsubService } from './eventsub.service';
import { IngestionRecovery, IngestionWorker } from './ingestion.worker';
@Module({
  imports: [
    AuthModule,
    PublicationsModule,
    BullModule.registerQueue({ name: catchupQueue }),
    OpenLoopsModule,
    BullModule.registerQueue({ name: queueNames.ingestion }),
  ],
  controllers: [EventsubController, EventsubWebhookController],
  providers: [
    EventsubRepository,
    EventsubClient,
    EventsubService,
    IngestionWorker,
    IngestionRecovery,
    CatchupWorker,
    CatchupRecovery,
  ],
})
export class IngestionModule {}
