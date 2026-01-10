import { Module } from '@nestjs/common';
import { SyncService } from '../application/sync.service';
import { SyncEventRepository } from '../application/ports/sync-event-repository';
import { SyncAccessPolicy } from '../application/ports/sync-access-policy';
import { SyncStoreRepository } from '../application/ports/sync-store-repository';
import { KyselySyncEventRepository } from '../infrastructure/kysely-sync-event.repository';
import { KyselySyncStoreRepository } from '../infrastructure/kysely-sync-store.repository';
import { OwnerOnlySyncAccessPolicy } from '../infrastructure/owner-only-sync-access.policy';
import { SyncDatabaseModule } from '../infrastructure/database.module';
import { SyncController } from './sync.controller';
import { AccessModule } from '@access/presentation/access.module';
import { SharingModule } from '@sharing/presentation/sharing.module';

@Module({
  imports: [SyncDatabaseModule, AccessModule, SharingModule],
  controllers: [SyncController],
  providers: [
    SyncService,
    {
      provide: SyncEventRepository,
      useClass: KyselySyncEventRepository,
    },
    {
      provide: SyncStoreRepository,
      useClass: KyselySyncStoreRepository,
    },
    {
      provide: SyncAccessPolicy,
      useClass: OwnerOnlySyncAccessPolicy,
    },
  ],
  exports: [SyncService],
})
export class SyncModule {}
