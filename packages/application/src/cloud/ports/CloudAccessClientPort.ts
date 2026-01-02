export type CloudIdentitySession = {
  identityId: string;
  email?: string;
};

export interface CloudAccessClientPort {
  whoAmI(): Promise<CloudIdentitySession | null>;

  register(params: { email: string; password: string }): Promise<CloudIdentitySession>;

  login(params: { email: string; password: string }): Promise<CloudIdentitySession>;

  logout(): Promise<{ revoked: boolean }>;
}
