import { UserId } from '@mo/domain';
import { KeyBackup } from '../ports/types';
import {
  CommandResult,
  ValidationError,
  failure,
  success,
} from '../results/CommandResult';
import { safeConvert, validateTimestamp } from './validation';

export interface ImportUserKeysCommand {
  readonly type: 'ImportUserKeys';
  readonly userId: string;
  readonly backup: KeyBackup;
  readonly timestamp: number;
}

export interface ValidatedImportUserKeysCommand {
  readonly userId: UserId;
  readonly backup: KeyBackup;
  readonly timestamp: Date;
}

export function validateImportUserKeysCommand(
  command: ImportUserKeysCommand
): CommandResult<ValidatedImportUserKeysCommand> {
  const errors: ValidationError[] = [];

  const userId = safeConvert(() => UserId.of(command.userId), 'userId', errors);
  const backup = validateBackup(command.backup, 'backup', errors);
  const timestamp = validateTimestamp(command.timestamp, 'timestamp', errors);

  if (errors.length > 0 || !userId || !backup || !timestamp) {
    return failure(errors);
  }

  return success({ userId, backup, timestamp });
}

const validateBackup = (
  backup: KeyBackup,
  field: string,
  errors: ValidationError[]
): KeyBackup | null => {
  if (!backup || typeof backup !== 'object') {
    errors.push({ field, message: 'Backup is required' });
    return null;
  }

  const identity = backup.identityKeys;
  if (!identity) {
    errors.push({ field, message: 'Identity keys missing' });
    return null;
  }

  const requiredIdentity = [
    { key: identity.signingPrivateKey, name: 'signingPrivateKey' },
    { key: identity.signingPublicKey, name: 'signingPublicKey' },
    { key: identity.encryptionPrivateKey, name: 'encryptionPrivateKey' },
    { key: identity.encryptionPublicKey, name: 'encryptionPublicKey' },
  ];

  for (const { key, name } of requiredIdentity) {
    if (!(key instanceof Uint8Array) || key.length === 0) {
      errors.push({
        field: `${field}.${name}`,
        message: 'Value must be a non-empty byte array',
      });
    }
  }

  if (backup.aggregateKeys) {
    for (const [aggregateId, key] of Object.entries(backup.aggregateKeys)) {
      if (!(key instanceof Uint8Array) || key.length === 0) {
        errors.push({
          field: `${field}.aggregateKeys.${aggregateId}`,
          message: 'Aggregate key must be a non-empty byte array',
        });
      }
    }
  }

  return errors.some((e) => e.field.startsWith(field)) ? null : backup;
};
