import { Module } from '@nestjs/common';
import { DatabaseModule } from '@platform/infrastructure/database/database.module';
import { KratosSessionGuard } from './guards/kratos-session.guard';
import { KratosClient } from '../infrastructure/kratos.client';
import { KratosPasswordService } from '../infrastructure/kratos-password.service';
import { AuthController } from './controllers/auth.controller';
import { MeController } from './controllers/me.controller';
import { AuthService } from '../application/auth.service';
import { KyselyIdentityRepository } from '../infrastructure/user.repository';
import { IdentityRepository } from '../application/ports/user-repository';

@Module({
  imports: [DatabaseModule],
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
export class AuthModule {}
