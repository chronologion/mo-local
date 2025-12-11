import { ValidationError } from './CommandResult';
import { ValidationException } from '../../errors/ValidationError';

type FieldParser<TCommand, TResult> = (command: TCommand) => TResult;

type ParsedFromSpec<
  TCommand,
  TSpec extends Record<string, FieldParser<TCommand, unknown>>,
> = {
  [TKey in keyof TSpec]: TSpec[TKey] extends FieldParser<
    TCommand,
    infer TResult
  >
    ? TResult
    : never;
};

/**
 * Base class for command handlers that need to parse primitives into
 * value objects while collecting structured validation errors.
 */
export abstract class BaseCommandHandler {
  /**
   * Parse a command according to a field specification.
   *
   * Each field parser is responsible for converting from primitives
   * (the command payload) into richer types (VOs, Dates, etc.).
   *
   * If any parser throws, the error is captured and re-thrown as a
   * ValidationException with field-scoped messages.
   */
  protected parseCommand<
    TCommand,
    TSpec extends Record<string, FieldParser<TCommand, unknown>>,
  >(command: TCommand, spec: TSpec): ParsedFromSpec<TCommand, TSpec> {
    const errors: ValidationError[] = [];
    const result: Partial<ParsedFromSpec<TCommand, TSpec>> = {};

    (Object.keys(spec) as Array<keyof TSpec>).forEach((field) => {
      const parser = spec[field];
      try {
        const value = parser(command);
        (result as ParsedFromSpec<TCommand, TSpec>)[field] =
          value as ParsedFromSpec<TCommand, TSpec>[typeof field];
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Invalid value';
        errors.push({ field: String(field), message });
      }
    });

    if (errors.length > 0) {
      throw new ValidationException(errors);
    }

    return result as ParsedFromSpec<TCommand, TSpec>;
  }
}
