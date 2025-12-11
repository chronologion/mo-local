import { ValidationError as CommandValidationError } from '../shared/ports/CommandResult';
import { ApplicationError } from './ApplicationError';

/**
 * Exception wrapper for command validation errors.
 *
 * Named differently from the ValidationError DTO type to avoid collisions.
 */
export class ValidationException extends ApplicationError {
  constructor(readonly details: CommandValidationError[]) {
    super('Validation failed', 'validation_error');
    this.name = 'ValidationException';
  }
}
