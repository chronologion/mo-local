import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AccessModule } from '@access/presentation/access.module';
import { DatabaseModule } from '@platform/infrastructure/database/database.module';
import { HealthController } from '@platform/presentation/health.controller';
import { SyncModule } from '@sync/presentation/sync.module';
import { SharingModule } from '@sharing/presentation/sharing.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    AccessModule,
    SyncModule,
    SharingModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
