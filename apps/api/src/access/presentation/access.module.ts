import { Module } from '@nestjs/common';
import { KratosSessionGuard } from './guards/kratos-session.guard';
import { KratosClient } from '../infrastructure/kratos.client';
import { KratosPasswordService } from '../infrastructure/kratos-password.service';
import { AuthController } from './controllers/auth.controller';
import { MeController } from './controllers/me.controller';
import { AuthService } from '../application/auth.service';
import { KyselyIdentityRepository } from '../infrastructure/identity.repository';
import { IdentityRepository } from '../application/ports/identity-repository';
import { AccessDatabaseModule } from '../infrastructure/database.module';

@Module({
  imports: [AccessDatabaseModule],
  controllers: [AuthController, MeController],
  providers: [
    KratosClient,
    KratosSessionGuard,
    KratosPasswordService,
    AuthService,
    {
      provide: IdentityRepository,
      useClass: KyselyIdentityRepository,
    },
  ],
  exports: [
    KratosClient,
    KratosSessionGuard,
    KratosPasswordService,
    AuthService,
  ],
})
export class AccessModule {}
