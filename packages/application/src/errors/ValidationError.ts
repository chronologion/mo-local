import { ValidationError as CommandValidationError } from '../results/CommandResult';
import { ApplicationError } from './ApplicationError';

export class ValidationError extends ApplicationError {
  constructor(readonly details: CommandValidationError[]) {
    super('Validation failed', 'validation_error');
    this.name = 'ValidationError';
  }
}
