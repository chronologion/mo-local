import { UserId } from '@mo/domain';
import {
  CommandResult,
  ValidationError,
  failure,
  success,
} from '../../shared/ports/CommandResult';
import { safeConvert, validateTimestamp } from '../../shared/validation';

export interface RegisterUserCommand {
  readonly actorId: string;
  readonly signingPublicKey: Uint8Array;
  readonly encryptionPublicKey: Uint8Array;
  readonly timestamp: number;
}

export interface ValidatedRegisterUserCommand {
  readonly actorId: UserId;
  readonly signingPublicKey: Uint8Array;
  readonly encryptionPublicKey: Uint8Array;
  readonly timestamp: number;
}

export function validateRegisterUserCommand(
  command: RegisterUserCommand
): CommandResult<ValidatedRegisterUserCommand> {
  const errors: ValidationError[] = [];

  const actorId = safeConvert(
    () => UserId.from(command.actorId),
    'actorId',
    errors
  );
  const signingPublicKey = validateBytes(
    command.signingPublicKey,
    'signingPublicKey',
    errors
  );
  const encryptionPublicKey = validateBytes(
    command.encryptionPublicKey,
    'encryptionPublicKey',
    errors
  );
  const timestamp = validateTimestamp(command.timestamp, 'timestamp', errors);

  if (
    errors.length > 0 ||
    !actorId ||
    !signingPublicKey ||
    !encryptionPublicKey ||
    !timestamp
  ) {
    return failure(errors);
  }

  return success({ actorId, signingPublicKey, encryptionPublicKey, timestamp });
}

const validateBytes = (
  value: Uint8Array,
  field: string,
  errors: ValidationError[]
): Uint8Array | null => {
  if (value instanceof Uint8Array && value.length > 0) {
    return value;
  }
  errors.push({ field, message: 'Value must be a non-empty byte array' });
  return null;
};
