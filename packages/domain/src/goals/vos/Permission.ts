import { Assert } from '../../shared/Assert';
import { ValueObject } from '../../shared/vos/ValueObject';

export const permissionValues = ['view', 'edit'] as const;
export type PermissionValue = (typeof permissionValues)[number];

/**
 * Value object representing goal access permission.
 *
 * Encapsulates the allowed permission levels ('view' | 'edit') so that
 * all validation lives in the domain and not in handlers.
 */
export class Permission extends ValueObject<PermissionValue> {
  private constructor(private readonly _value: PermissionValue) {
    super();
    Assert.that(_value, 'Permission').isOneOf(permissionValues);
  }

  /**
   * Factory from a primitive value.
   */
  static from(value: string): Permission {
    Assert.that(value, 'Permission').isOneOf(permissionValues);
    return new Permission(value as PermissionValue);
  }

  get value(): PermissionValue {
    return this._value;
  }

  isView(): boolean {
    return this._value === 'view';
  }

  isEdit(): boolean {
    return this._value === 'edit';
  }
}
