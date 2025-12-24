import { ValidationError } from './CommandResult';
import { ValidationException } from '../../errors/ValidationError';
import { ConcurrencyError } from '../../errors/ConcurrencyError';
import type { IdempotencyRecord } from './IIdempotencyStore';

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

  protected parseKnownVersion(version: number): number {
    if (!Number.isInteger(version) || version < 0) {
      throw new Error('knownVersion must be a non-negative integer');
    }
    return version;
  }

  protected parseIdempotencyKey(key: string): string {
    if (typeof key !== 'string' || key.trim().length === 0) {
      throw new Error('idempotencyKey must be a non-empty string');
    }
    if (key.length > 200) {
      throw new Error('idempotencyKey must be at most 200 characters');
    }
    return key;
  }

  protected assertIdempotencyRecord(params: {
    existing: IdempotencyRecord;
    expectedCommandType: string;
    expectedAggregateId: string;
  }): void {
    const { existing, expectedCommandType, expectedAggregateId } = params;
    if (
      existing.commandType !== expectedCommandType ||
      existing.aggregateId !== expectedAggregateId
    ) {
      throw new Error(
        `Idempotency key reuse detected for ${existing.key} (existing ${existing.commandType}/${existing.aggregateId}, new ${expectedCommandType}/${expectedAggregateId})`
      );
    }
  }

  protected assertKnownVersion(params: {
    actual: number;
    expected: number;
    aggregateType: string;
    aggregateId: string;
  }): void {
    const { actual, expected, aggregateType, aggregateId } = params;
    if (actual !== expected) {
      throw new ConcurrencyError(
        `${aggregateType} ${aggregateId} version mismatch (expected ${expected}, got ${actual})`
      );
    }
  }
}
