import type { ActionDefinition, JsonSchema, ProviderDefinition } from "../core/types.ts";

import { jsonSchema } from "../core/json-schema.ts";

/**
 * Minimal OpenAPI document shape returned by the local runtime.
 */
export type OpenApiDocument = {
  openapi: "3.1.0";
  info: {
    title: string;
    version: string;
  };
  paths: Record<string, unknown>;
  components: {
    schemas: Record<string, JsonSchema>;
  };
};

/**
 * Controls how much provider action detail is embedded in the OpenAPI document.
 */
export type OpenApiDocumentOptions = {
  actionId?: string;
};

const errorPayloadSchema = jsonSchema.object(
  {
    code: jsonSchema.string({ description: "Stable machine-readable error code." }),
    message: jsonSchema.string({ description: "Human-readable error message." }),
    details: {},
  },
  {
    required: ["code", "message"],
    description: "Error payload.",
  },
);

const errorResponseSchema = jsonSchema.object(
  {
    error: errorPayloadSchema,
  },
  {
    required: ["error"],
    description: "Standard error response.",
  },
);

const executionResultSchema = jsonSchema.object(
  {
    ok: jsonSchema.boolean({ description: "Whether execution succeeded." }),
    output: {
      description: "Action output matching the selected action's output schema.",
    },
    error: errorPayloadSchema,
  },
  {
    required: ["ok"],
    description: "Action execution result.",
  },
);

const oauthClientConfigRequestSchema = jsonSchema.object(
  {
    clientId: jsonSchema.string({ description: "OAuth app client id." }),
    clientSecret: jsonSchema.string({
      description: "OAuth app client secret. Optional only for public-client providers.",
    }),
    extra: {
      type: "object",
      additionalProperties: { type: "string" },
      description: "Additional OAuth client config values keyed by provider-declared field ids.",
    },
  },
  {
    required: ["clientId"],
    description: "User-provided OAuth app client configuration.",
  },
);

/**
 * Build OpenAPI docs from the generated catalog.
 *
 * The action catalog remains the source of truth for provider-specific input
 * and output schemas. The default document stays compact and exposes one
 * generic run creation route. Pass `actionId` to embed one concrete action schema for
 * tool importers that need a small strongly typed OpenAPI document.
 */
export function createOpenApiDocument(
  providers: ProviderDefinition[],
  options: OpenApiDocumentOptions = {},
): OpenApiDocument {
  const actions = providers.flatMap((provider) => provider.actions);
  const concreteAction = options.actionId ? actions.find((action) => action.id === options.actionId) : undefined;
  const runPath = createRunPath();
  if (concreteAction) {
    runPath.post = createConcreteRunOperation(concreteAction);
  }

  const paths: Record<string, unknown> = {
    "/health": getOperation("Runtime health check.", { ok: jsonSchema.boolean() }),
    "/api/apps": getOperation("List provider catalog entries.", {
      type: "array",
      items: { $ref: "#/components/schemas/ProviderDefinition" },
    }),
    "/api/apps/{service}": getOperation("Get one provider catalog entry.", {
      $ref: "#/components/schemas/ProviderDefinition",
    }),
    "/api/actions": getOperation("List all catalog actions.", {
      type: "array",
      items: { $ref: "#/components/schemas/ActionDefinition" },
    }),
    "/api/actions/{actionId}": getOperation("Get one catalog action.", {
      $ref: "#/components/schemas/ActionDefinition",
    }),
    "/api/{actionId}.md": getOperation("Get one markdown action guide.", {
      type: "string",
      description: "Markdown guide for one action.",
    }),
    "/api/connections": getOperation("List local provider connections.", {
      type: "array",
      items: { $ref: "#/components/schemas/ConnectionSummary" },
    }),
    "/api/connections/{service}": createConnectionPath(),
    "/api/oauth/configs": getOperation("List local OAuth client configurations.", {
      type: "array",
      items: { $ref: "#/components/schemas/OAuthClientConfigSummary" },
    }),
    "/api/oauth/configs/{service}": createOAuthConfigPath(),
    "/api/oauth/authorizations": createOAuthAuthorizationPath(),
    "/api/run/{actionId}": runPath,
    "/api/runs": createRunsPath(),
    "/mcp": createMcpPath(),
    "/mcp/tools": getOperation("List discovery-oriented MCP tool summaries.", {
      type: "object",
      properties: {
        tools: { type: "array", items: { type: "object", additionalProperties: true } },
      },
      required: ["tools"],
    }),
  };

  return {
    openapi: "3.1.0",
    info: {
      title: "OOMOL Connect Local Runtime",
      version: "0.1.0",
    },
    paths,
    components: {
      schemas: {
        ActionDefinition: jsonSchema.unknownObject("Public action catalog definition with runtime execution status."),
        ConnectionSummary: jsonSchema.object(
          {
            service: jsonSchema.string({ description: "Provider service identifier." }),
            authType: jsonSchema.string({ description: "Connection authentication type." }),
            configured: jsonSchema.boolean({ description: "Whether the provider is connected." }),
            virtual: jsonSchema.boolean({
              description: "Whether the connection needs no stored secret.",
            }),
            profile: jsonSchema.object(
              {
                accountId: jsonSchema.string({
                  description: "Provider-side account, user, workspace, bot, or token identifier.",
                }),
                displayName: jsonSchema.string({
                  description: "Human-readable account label shown to users and agents.",
                }),
                grantedScopes: {
                  type: "array",
                  items: { type: "string" },
                  description: "Provider-native scopes granted to the stored credential, when known.",
                },
              },
              {
                required: ["accountId", "displayName", "grantedScopes"],
                description: "Stable provider account identity safe for users and agents.",
              },
            ),
          },
          {
            required: ["service", "authType", "configured", "virtual", "profile"],
            description: "Local provider connection summary.",
          },
        ),
        ErrorResponse: errorResponseSchema,
        ExecutionResult: executionResultSchema,
        ConnectionUpsertRequest: createConnectionUpsertRequestSchema(),
        OAuthClientConfigSummary: jsonSchema.object(
          {
            service: jsonSchema.string({ description: "Provider service identifier." }),
            configured: jsonSchema.boolean({
              description: "Whether a local OAuth client config is configured.",
            }),
            clientId: jsonSchema.nullable(jsonSchema.string({ description: "Configured OAuth client id." })),
            expectedRedirectUri: jsonSchema.string({
              description: "Callback URL to configure in the provider OAuth app.",
            }),
            auth: jsonSchema.unknownObject("Provider OAuth capability metadata."),
          },
          {
            required: ["service", "configured", "clientId", "expectedRedirectUri", "auth"],
            description: "OAuth client config summary safe for the local console.",
          },
        ),
        OAuthClientConfigRequest: oauthClientConfigRequestSchema,
        ProviderDefinition: jsonSchema.unknownObject("Public provider catalog definition."),
        RunLog: jsonSchema.object(
          {
            id: jsonSchema.string({ description: "Run identifier." }),
            actionId: jsonSchema.string({ description: "Executed action id." }),
            caller: jsonSchema.string({
              description: "Runtime entry point that executed the run.",
            }),
            startedAt: jsonSchema.string({ description: "Start timestamp." }),
            completedAt: jsonSchema.string({ description: "Completion timestamp." }),
            durationMs: jsonSchema.number({ description: "Run duration in milliseconds." }),
            ok: jsonSchema.boolean({ description: "Whether the run succeeded." }),
            connectionProfile: jsonSchema.unknownObject(
              "Provider account identity that the action used, when a connection was available.",
            ),
            inputSummary: {
              description: "Redacted action input summary.",
            },
            errorCode: jsonSchema.string({ description: "Error code when the run failed." }),
            errorMessage: jsonSchema.string({ description: "Error message when the run failed." }),
          },
          {
            required: ["id", "actionId", "caller", "startedAt", "completedAt", "durationMs", "ok"],
            description: "Recent action run entry.",
          },
        ),
      },
    },
  };
}

function createMcpPath(): unknown {
  return {
    post: {
      summary: "Handle MCP Streamable HTTP requests.",
      responses: {
        "200": {
          description: "MCP JSON-RPC response.",
          content: {
            "application/json": {
              schema: { type: "object", additionalProperties: true },
            },
          },
        },
      },
    },
  };
}

function createRunsPath(): Record<string, unknown> {
  return {
    get: {
      summary: "List recent local action runs.",
      responses: {
        200: jsonResponse({
          type: "array",
          items: { $ref: "#/components/schemas/RunLog" },
        }),
      },
    },
  };
}

function createRunPath(): Record<string, unknown> {
  return {
    post: {
      summary: "Create a local action run.",
      description:
        "Use the action catalog to discover provider-specific input and output schemas. For a compact strongly typed OpenAPI document for one action, request /openapi.json?actionId=<actionId>.",
      parameters: [
        {
          name: "actionId",
          in: "path",
          required: true,
          schema: jsonSchema.string({ description: "Action id, usually <service>.<name>." }),
        },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: jsonSchema.object(
              {
                input: jsonSchema.unknownObject("Action input matching the catalog schema."),
              },
              {
                required: ["input"],
                description: "Generic action run creation request.",
              },
            ),
          },
        },
      },
      responses: {
        200: jsonResponse({ $ref: "#/components/schemas/ExecutionResult" }),
        400: jsonResponse({ $ref: "#/components/schemas/ExecutionResult" }),
        404: jsonResponse({ $ref: "#/components/schemas/ErrorResponse" }),
      },
    },
  };
}

function createConnectionPath(): Record<string, unknown> {
  return {
    put: {
      summary: "Create or replace a local provider connection.",
      description:
        "The accepted auth type and credential field keys are declared by the provider catalog auth metadata. Unknown fields are rejected.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ConnectionUpsertRequest" },
          },
        },
      },
      responses: {
        200: jsonResponse({ $ref: "#/components/schemas/ConnectionSummary" }),
        400: jsonResponse({ $ref: "#/components/schemas/ErrorResponse" }),
        404: jsonResponse({ $ref: "#/components/schemas/ErrorResponse" }),
      },
    },
    delete: {
      summary: "Disconnect a provider.",
      responses: {
        200: jsonResponse({
          anyOf: [
            { $ref: "#/components/schemas/ConnectionSummary" },
            jsonSchema.object(
              {
                service: jsonSchema.string(),
                configured: { const: false, type: "boolean" },
              },
              {
                required: ["service", "configured"],
                description: "Disconnected provider summary.",
              },
            ),
          ],
        }),
        404: jsonResponse({ $ref: "#/components/schemas/ErrorResponse" }),
      },
    },
  };
}

function createOAuthAuthorizationPath(): Record<string, unknown> {
  return {
    post: {
      summary: "Start provider OAuth authorization.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: jsonSchema.object(
              {
                service: jsonSchema.string({ description: "Provider service identifier." }),
              },
              {
                required: ["service"],
                description: "OAuth authorization creation request.",
              },
            ),
          },
        },
      },
      responses: {
        200: jsonResponse(
          jsonSchema.object(
            {
              service: jsonSchema.string(),
              authorizationUrl: jsonSchema.string(),
              state: jsonSchema.string(),
            },
            {
              required: ["service", "authorizationUrl", "state"],
              description: "OAuth authorization start response.",
            },
          ),
        ),
        400: jsonResponse({ $ref: "#/components/schemas/ErrorResponse" }),
        404: jsonResponse({ $ref: "#/components/schemas/ErrorResponse" }),
      },
    },
  };
}

function createOAuthConfigPath(): Record<string, unknown> {
  return {
    put: {
      summary: "Upsert local OAuth client configuration.",
      description:
        "Open-source users provide their own OAuth app. Additional extra fields are declared by provider catalog auth metadata.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/OAuthClientConfigRequest" },
          },
        },
      },
      responses: {
        200: jsonResponse({ $ref: "#/components/schemas/OAuthClientConfigSummary" }),
        400: jsonResponse({ $ref: "#/components/schemas/ErrorResponse" }),
        404: jsonResponse({ $ref: "#/components/schemas/ErrorResponse" }),
      },
    },
    delete: {
      summary: "Delete local OAuth client configuration.",
      responses: {
        200: jsonResponse(
          jsonSchema.object(
            {
              service: jsonSchema.string(),
              configured: { const: false, type: "boolean" },
            },
            {
              required: ["service", "configured"],
              description: "Deleted OAuth client config summary.",
            },
          ),
        ),
        404: jsonResponse({ $ref: "#/components/schemas/ErrorResponse" }),
      },
    },
  };
}

function getOperation(summary: string, schema: JsonSchema): Record<string, unknown> {
  return {
    get: {
      summary,
      responses: {
        200: jsonResponse(schema),
        404: jsonResponse({ $ref: "#/components/schemas/ErrorResponse" }),
      },
    },
  };
}

function createConnectionUpsertRequestSchema(): JsonSchema {
  return jsonSchema.object(
    {
      authType: jsonSchema.string({
        description: "Connection auth type: no_auth, api_key, or custom_credential.",
      }),
      values: {
        type: "object",
        additionalProperties: { type: "string" },
        description: "Credential values keyed by provider-declared field ids.",
      },
    },
    {
      required: ["authType"],
      description: "Connection upsert request.",
    },
  );
}

function createConcreteRunOperation(action: ActionDefinition): Record<string, unknown> {
  return {
    summary: `Create a local run for ${action.id}.`,
    description: action.description,
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: jsonSchema.object(
            {
              input: action.inputSchema,
            },
            {
              required: ["input"],
              description: `Run creation request for ${action.id}.`,
            },
          ),
        },
      },
    },
    responses: {
      200: jsonResponse(
        jsonSchema.object(
          {
            ok: { const: true, type: "boolean" },
            output: action.outputSchema,
          },
          {
            required: ["ok", "output"],
            description: `Successful execution result for ${action.id}.`,
          },
        ),
      ),
      400: jsonResponse({ $ref: "#/components/schemas/ExecutionResult" }),
      404: jsonResponse({ $ref: "#/components/schemas/ErrorResponse" }),
    },
  };
}

function jsonResponse(schema: JsonSchema): Record<string, unknown> {
  return {
    description: "JSON response.",
    content: {
      "application/json": {
        schema,
      },
    },
  };
}
