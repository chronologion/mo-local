import { Module } from '@nestjs/common';
import { SharingDatabaseModule } from '../infrastructure/database.module';
import { ScopeService } from '../application/scope.service';
import { GrantService } from '../application/grant.service';
import { KeyVaultService } from '../application/keyvault.service';
import { ScopeStateRepository } from '../application/ports/scope-state-repository';
import { ResourceGrantRepository } from '../application/ports/resource-grant-repository';
import { KeyEnvelopeRepository } from '../application/ports/key-envelope-repository';
import { KeyVaultRepository } from '../application/ports/keyvault-repository';
import { KyselyScopeStateRepository } from '../infrastructure/kysely-scope-state.repository';
import { KyselyResourceGrantRepository } from '../infrastructure/kysely-resource-grant.repository';
import { KyselyKeyEnvelopeRepository } from '../infrastructure/kysely-key-envelope.repository';
import { KyselyKeyVaultRepository } from '../infrastructure/kysely-keyvault.repository';

@Module({
  imports: [SharingDatabaseModule],
  providers: [
    // Services
    ScopeService,
    GrantService,
    KeyVaultService,
    // Repositories
    { provide: ScopeStateRepository, useClass: KyselyScopeStateRepository },
    { provide: ResourceGrantRepository, useClass: KyselyResourceGrantRepository },
    { provide: KeyEnvelopeRepository, useClass: KyselyKeyEnvelopeRepository },
    { provide: KeyVaultRepository, useClass: KyselyKeyVaultRepository },
  ],
  exports: [ScopeService, GrantService, KeyVaultService],
})
export class SharingModule {}
