import type { ActionDefinition } from "./types.ts";
import type { ErrorObject } from "ajv";

import AjvModule from "ajv";

const Ajv = AjvModule.default;
const ajv = new Ajv({ allErrors: true, strict: false });

/**
 * Result of validating an action input against its JSON Schema.
 */
export type ActionInputValidationResult = {
  valid: boolean | PromiseLike<unknown>;
  errors: ErrorObject[];
};

/**
 * Validate unknown user input against an action's declared input schema.
 */
export function validateActionInput(
  action: ActionDefinition,
  input: unknown,
): ActionInputValidationResult {
  const validate = ajv.compile(action.inputSchema);
  const valid = validate(input);
  const errors = validate.errors ?? [];

  return {
    valid,
    errors,
  };
}
