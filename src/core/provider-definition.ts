import type { ActionDefinition, JsonSchema } from "./types.ts";

/**
 * Input for defining one provider action without repeating provider-level
 * fields in every action object.
 */
export type DefineProviderActionInput = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  requiredScopes?: string[];
  providerPermissions?: string[];
  followUpActions?: string[];
  asyncLifecycle?: ActionDefinition["asyncLifecycle"];
};

/**
 * Create a full action definition for one provider.
 *
 * Provider modules use this helper so definitions read as business action
 * declarations instead of generated catalog JSON.
 */
export function defineProviderAction(
  service: string,
  input: DefineProviderActionInput,
): ActionDefinition {
  return {
    id: `${service}.${input.name}`,
    service,
    name: input.name,
    description: input.description,
    requiredScopes: input.requiredScopes ?? [],
    providerPermissions: input.providerPermissions ?? [],
    inputSchema: input.inputSchema,
    outputSchema: input.outputSchema,
    followUpActions: input.followUpActions,
    asyncLifecycle: input.asyncLifecycle,
  };
}
