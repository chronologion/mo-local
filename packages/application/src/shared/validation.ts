import { ValidationError } from './ports/CommandResult';

export const safeConvert = <T>(
  fn: () => T,
  field: string,
  errors: ValidationError[]
): T | null => {
  try {
    return fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid value';
    errors.push({ field, message });
    return null;
  }
};

export const validateTimestamp = (
  timestamp: number,
  field: string,
  errors: ValidationError[]
): number | null => {
  if (!Number.isFinite(timestamp)) {
    errors.push({ field, message: 'Timestamp must be a finite number' });
    return null;
  }

  return timestamp;
};
