import { Module } from '@nestjs/common';
import { SharingDatabaseService } from './database.service';

@Module({
  providers: [SharingDatabaseService],
  exports: [SharingDatabaseService],
})
export class SharingDatabaseModule {}
