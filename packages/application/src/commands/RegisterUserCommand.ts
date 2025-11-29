import { UserId } from '@mo/domain';
import {
  CommandResult,
  ValidationError,
  failure,
  success,
} from '../results/CommandResult';
import { safeConvert, validateTimestamp } from './validation';

export interface RegisterUserCommand {
  readonly type: 'RegisterUser';
  readonly userId: string;
  readonly signingPublicKey: Uint8Array;
  readonly encryptionPublicKey: Uint8Array;
  readonly timestamp: number;
}

export interface ValidatedRegisterUserCommand {
  readonly userId: UserId;
  readonly signingPublicKey: Uint8Array;
  readonly encryptionPublicKey: Uint8Array;
  readonly timestamp: Date;
}

export function validateRegisterUserCommand(
  command: RegisterUserCommand
): CommandResult<ValidatedRegisterUserCommand> {
  const errors: ValidationError[] = [];

  const userId = safeConvert(() => UserId.of(command.userId), 'userId', errors);
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
    !userId ||
    !signingPublicKey ||
    !encryptionPublicKey ||
    !timestamp
  ) {
    return failure(errors);
  }

  return success({ userId, signingPublicKey, encryptionPublicKey, timestamp });
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
