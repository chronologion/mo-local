export class InfraError extends Error {
  readonly code: string;

  constructor(message: string, code = 'infra_error') {
    super(message);
    this.code = code;
    this.name = 'InfraError';
  }
}

export class MissingKeyError extends InfraError {
  constructor(message: string) {
    super(message, 'missing_key');
    this.name = 'MissingKeyError';
  }
}

export class PersistenceError extends InfraError {
  constructor(message: string) {
    super(message, 'persistence_error');
    this.name = 'PersistenceError';
  }
}
