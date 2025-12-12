import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { KratosSessionGuard } from './kratos-session.guard';
import { KratosClient } from './kratos.client';
import { UserProvisioner } from './user-provisioner.service';
import { KratosPasswordService } from './kratos-password.service';
import { AuthController } from './auth.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [
    KratosClient,
    KratosSessionGuard,
    UserProvisioner,
    KratosPasswordService,
  ],
  exports: [
    KratosClient,
    KratosSessionGuard,
    UserProvisioner,
    KratosPasswordService,
  ],
})
export class AuthModule {}
