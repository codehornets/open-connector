import type { JsonSchema } from "./types.ts";

/**
 * Options shared by primitive JSON Schema helper functions.
 */
export type JsonSchemaOptions = {
  description?: string;
  default?: unknown;
  format?: string;
};

/**
 * JSON Schema helpers for provider action contracts.
 *
 * Provider definitions should use these helpers for common schema shapes and
 * drop to plain JSON Schema objects only for provider-specific edge cases.
 */
export const jsonSchema = {
  object(
    properties: Record<string, JsonSchema>,
    options: JsonSchemaOptions & {
      required?: string[];
      additionalProperties?: boolean | JsonSchema;
      defs?: Record<string, JsonSchema>;
    } = {},
  ): JsonSchema {
    const schema: JsonSchema = {
      type: "object",
      properties,
      additionalProperties: options.additionalProperties ?? false,
    };
    if (options.required && options.required.length > 0) schema.required = options.required;
    if (options.defs) schema.$defs = options.defs;
    return withOptions(schema, options);
  },

  array(items: JsonSchema, options: JsonSchemaOptions = {}): JsonSchema {
    return withOptions({ type: "array", items }, options);
  },

  string(options: JsonSchemaOptions & { minLength?: number; maxLength?: number } = {}): JsonSchema {
    const schema: JsonSchema = { type: "string" };
    if (options.minLength != null) schema.minLength = options.minLength;
    if (options.maxLength != null) schema.maxLength = options.maxLength;
    return withOptions(schema, options);
  },

  unknown(description: string): JsonSchema {
    return { description };
  },

  url(description: string): JsonSchema {
    return this.string({ format: "uri", description });
  },

  email(description: string): JsonSchema {
    return this.string({ format: "email", description });
  },

  dateTime(description: string): JsonSchema {
    return this.string({ format: "date-time", description });
  },

  stringPattern(pattern: string, options: JsonSchemaOptions = {}): JsonSchema {
    return withOptions({ type: "string", pattern }, options);
  },

  stringEnum(values: string[], options: JsonSchemaOptions = {}): JsonSchema {
    return withOptions({ type: "string", enum: values }, options);
  },

  integer(
    options: JsonSchemaOptions & {
      minimum?: number;
      maximum?: number;
      exclusiveMinimum?: number;
    } = {},
  ): JsonSchema {
    const schema: JsonSchema = { type: "integer" };
    if (options.minimum != null) schema.minimum = options.minimum;
    if (options.maximum != null) schema.maximum = options.maximum;
    if (options.exclusiveMinimum != null) schema.exclusiveMinimum = options.exclusiveMinimum;
    return withOptions(schema, options);
  },

  number(
    options: JsonSchemaOptions & {
      minimum?: number;
      maximum?: number;
      exclusiveMinimum?: number;
    } = {},
  ): JsonSchema {
    const schema: JsonSchema = { type: "number" };
    if (options.minimum != null) schema.minimum = options.minimum;
    if (options.maximum != null) schema.maximum = options.maximum;
    if (options.exclusiveMinimum != null) schema.exclusiveMinimum = options.exclusiveMinimum;
    return withOptions(schema, options);
  },

  boolean(options: JsonSchemaOptions = {}): JsonSchema {
    return withOptions({ type: "boolean" }, options);
  },

  literal(value: string | number | boolean, options: JsonSchemaOptions = {}): JsonSchema {
    return withOptions({ const: value, type: typeof value }, options);
  },

  anyOf(schemas: JsonSchema[], options: JsonSchemaOptions = {}): JsonSchema {
    return withOptions({ anyOf: schemas }, options);
  },

  union(schemas: JsonSchema[], options: JsonSchemaOptions = {}): JsonSchema {
    return withOptions({ anyOf: schemas }, options);
  },

  oneOf(schemas: JsonSchema[], options: JsonSchemaOptions = {}): JsonSchema {
    return withOptions({ oneOf: schemas }, options);
  },

  nullable(schema: JsonSchema): JsonSchema {
    return { anyOf: [schema, { type: "null" }] };
  },

  ref(ref: string, options: JsonSchemaOptions = {}): JsonSchema {
    return withOptions({ $ref: ref }, options);
  },

  record(values: JsonSchema | boolean, options: JsonSchemaOptions = {}): JsonSchema {
    return withOptions({ type: "object", additionalProperties: values }, options);
  },

  looseObject(
    properties: Record<string, JsonSchema> = {},
    options: JsonSchemaOptions = {},
  ): JsonSchema {
    return this.object(properties, { ...options, additionalProperties: true });
  },

  unknownObject(description: string): JsonSchema {
    return {
      type: "object",
      additionalProperties: true,
      description,
    };
  },
} as const;

/**
 * Short alias for provider schema definitions.
 */
export const s: typeof jsonSchema = jsonSchema;

function withOptions(schema: JsonSchema, options: JsonSchemaOptions): JsonSchema {
  if (options.description) schema.description = options.description;
  if (options.default !== undefined) schema.default = options.default;
  if (options.format) schema.format = options.format;
  return schema;
}
