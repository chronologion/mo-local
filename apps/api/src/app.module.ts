import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AccessModule } from '@access/presentation/access.module';
import { DatabaseModule } from '@platform/infrastructure/database/database.module';
import { HealthController } from '@platform/presentation/health.controller';
import { SyncModule } from '@sync/presentation/sync.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    AccessModule,
    SyncModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
