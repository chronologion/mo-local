export type Primitive = string | number | boolean | null;

/**
 * Recursively maps domain payload shapes to their JSON form.
 *
 * Rules (in order of precedence):
 * - If a type exposes toJSON(), use its return type.
 * - If it's a ValueObject<...>, unwrap to the underlying value.
 * - Dates become epoch millis.
 * - Primitives stay as-is.
 * - Arrays are mapped element-wise.
 * - Objects are mapped field-wise.
 */
export type ToJSON<T> =
  // Explicit toJSON wins if present
  T extends { toJSON(): infer R }
    ? R
    : // Value objects unwrap to their underlying primitive
      T extends import('./vos/ValueObject').ValueObject<infer V>
      ? V
      : // Raw Date
        T extends Date
        ? number
        : // Primitives
          T extends Primitive
          ? T
          : // Arrays / readonly arrays
            T extends readonly (infer U)[]
            ? ToJSON<U>[]
            : // Objects: map fields recursively
              T extends object
              ? { [K in keyof T]: ToJSON<T[K]> }
              : never;
