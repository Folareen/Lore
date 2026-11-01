import { Module } from '@nestjs/common';
import { DiscoverController } from './discover.controller';
import { DiscoverRepository } from './discover.repository';
@Module({ controllers: [DiscoverController], providers: [DiscoverRepository] })
export class DiscoverModule {}
