import { Injectable } from '@nestjs/common';
import { KratosPasswordService } from '../infrastructure/kratos-password.service';
import { KratosClient } from '../infrastructure/kratos.client';
import { UserRepository } from './ports/user-repository';
import { AuthenticatedUser } from '../domain/authenticated-user';

@Injectable()
export class AuthService {
  constructor(
    private readonly kratosPassword: KratosPasswordService,
    private readonly kratosClient: KratosClient,
    private readonly users: UserRepository
  ) {}

  async register(email: string, password: string) {
    const session = await this.kratosPassword.register(email, password);
    await this.users.ensureExists({ id: session.identityId });
    return session;
  }

  async login(email: string, password: string) {
    const session = await this.kratosPassword.login(email, password);
    await this.users.ensureExists({ id: session.identityId });
    return session;
  }

  async logout(sessionToken: string): Promise<void> {
    await this.kratosPassword.logout(sessionToken);
  }

  async validateSession(
    sessionToken: string
  ): Promise<AuthenticatedUser & { email?: string }> {
    const session = await this.kratosClient.whoAmI(sessionToken);
    await this.users.ensureExists({ id: session.id });
    return session;
  }
}
