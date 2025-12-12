export interface AuthenticatedUser {
  id: string;
  traits: Record<string, unknown>;
}

interface KratosIdentity {
  id: string;
  traits: Record<string, unknown>;
}

export interface KratosWhoAmIResponse {
  identity: KratosIdentity;
}
