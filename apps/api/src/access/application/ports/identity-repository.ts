export abstract class IdentityRepository {
  abstract ensureExists(params: { id: string }): Promise<void>;
}
