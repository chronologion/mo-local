export abstract class UserRepository {
  abstract ensureExists(params: { id: string }): Promise<void>;
}
