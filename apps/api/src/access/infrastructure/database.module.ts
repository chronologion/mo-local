import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AccessDatabaseService } from './database.service';

@Module({
  imports: [ConfigModule],
  providers: [AccessDatabaseService],
  exports: [AccessDatabaseService],
})
export class AccessDatabaseModule {}
