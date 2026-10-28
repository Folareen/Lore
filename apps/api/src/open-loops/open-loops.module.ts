import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OpenLoopsController } from './open-loops.controller';
import { OpenLoopsRepository } from './open-loops.repository';
@Module({
  imports: [AuthModule],
  controllers: [OpenLoopsController],
  providers: [OpenLoopsRepository],
  exports: [OpenLoopsRepository],
})
export class OpenLoopsModule {}
