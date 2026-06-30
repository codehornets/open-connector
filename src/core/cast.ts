/**
 * Error factory used by strict cast helpers.
 */
export type CastErrorFactory = (message: string) => Error;

/**
 * Controls how string values are read from unknown input.
 */
export type StringCastOptions = {
  trim?: boolean;
  empty?: "omit" | "keep";
};

/**
 * Default error raised by strict cast helpers.
 */
export class CastError extends Error {}

/**
 * Return a shallow copy without undefined values.
 */
export function compactObject<T extends Record<string, unknown>>(input: T): Partial<T> {
  const output: Partial<T> = {};
  for (const [key, value] of Object.entries(input) as Array<[keyof T, T[keyof T]]>) {
    if (value !== undefined) {
      output[key] = value;
    }
  }
  return output;
}

/**
 * Return a trimmed string when the value is a non-empty string.
 */
export function optionalString(
  value: unknown,
  options: StringCastOptions = {},
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const result = options.trim === false ? value : value.trim();
  return result || options.empty === "keep" ? result : undefined;
}

/**
 * Return a string exactly as provided, including empty strings and surrounding whitespace.
 */
export function optionalText(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * Return a string or throw a caller-provided error.
 */
export function requiredString(
  value: unknown,
  fieldName: string,
  createError: CastErrorFactory = (message) => new CastError(message),
  options: StringCastOptions = {},
): string {
  const result = optionalString(value, options);
  if (result) {
    return result;
  }

  throw createError(`${fieldName} is required.`);
}

/**
 * Return a plain object record when the value can be used as JSON object data.
 */
export function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

/**
 * Keep only non-empty string values and trim them.
 */
export function stringRecord(input: Record<string, unknown>): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    const text = optionalString(value);
    if (text) {
      values[key] = text;
    }
  }
  return values;
}

/**
 * Return an integer if the value is already an integer number.
 */
export function optionalInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

/**
 * Return an integer, null, or undefined when the value is not an integer.
 */
export function nullableInteger(value: unknown): number | null | undefined {
  return value === null ? null : optionalInteger(value);
}

/**
 * Return a boolean if the value is already boolean.
 */
export function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

/**
 * Return a string, null, or undefined when the value is not a string.
 */
export function nullableString(
  value: unknown,
  options: StringCastOptions = {},
): string | null | undefined {
  return value === null ? null : optionalString(value, options);
}

/**
 * Return exact text, null, or undefined when the value is not a string.
 */
export function nullableText(value: unknown): string | null | undefined {
  return value === null ? null : optionalText(value);
}

/**
 * Return a positive integer from a number or numeric string.
 */
export function positiveInteger(
  value: unknown,
  fieldName: string,
  createError: CastErrorFactory = (message) => new CastError(message),
): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return Number(value);
  }

  throw createError(`${fieldName} must be a positive integer`);
}
