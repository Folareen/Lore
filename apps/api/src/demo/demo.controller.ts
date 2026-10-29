import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { demoDatasetSchema } from '@lore/shared';
import { InfrastructureService } from '../infrastructure.service';
import { demoDatasets } from '../database/schema';
@Controller('demo')
export class DemoController {
  constructor(
    @Inject(InfrastructureService)
    private readonly infrastructure: InfrastructureService,
  ) {}
  @Get() async load() {
    const [row] = await this.infrastructure.db
      .select({ payload: demoDatasets.payload })
      .from(demoDatasets)
      .where(eq(demoDatasets.slug, 'lore-demo'));
    const result = demoDatasetSchema.safeParse(row?.payload);
    if (!result.success)
      throw new ServiceUnavailableException('The demo dataset is not ready.');
    return result.data;
  }
}
