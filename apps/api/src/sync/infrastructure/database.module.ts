import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SyncDatabaseService } from './database.service';

@Module({
  imports: [ConfigModule],
  providers: [SyncDatabaseService],
  exports: [SyncDatabaseService],
})
export class SyncDatabaseModule {}
