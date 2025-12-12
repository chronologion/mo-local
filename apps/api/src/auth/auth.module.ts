import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { KratosSessionGuard } from './kratos-session.guard';
import { KratosClient } from './kratos.client';
import { UserProvisioner } from './user-provisioner.service';

@Module({
  imports: [DatabaseModule],
  providers: [KratosClient, KratosSessionGuard, UserProvisioner],
  exports: [KratosClient, KratosSessionGuard, UserProvisioner],
})
export class AuthModule {}
