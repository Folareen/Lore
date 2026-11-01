import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Query,
} from '@nestjs/common';
import { discoverQuerySchema } from '@lore/shared';
import { DiscoverRepository } from './discover.repository';
@Controller('public/channels')
export class DiscoverController {
  constructor(
    @Inject(DiscoverRepository) private readonly repository: DiscoverRepository,
  ) {}
  @Get() list(@Query() query: unknown) {
    const input = discoverQuerySchema.safeParse(query);
    if (!input.success)
      throw new BadRequestException(
        'Search for a channel using up to 100 characters.',
      );
    return this.repository.list(input.data);
  }
}
