import { ApplicationError } from './ApplicationError';

export class ConcurrencyError extends ApplicationError {
  constructor(message = 'Concurrency conflict') {
    super(message, 'concurrency_conflict');
    this.name = 'ConcurrencyError';
  }
}
