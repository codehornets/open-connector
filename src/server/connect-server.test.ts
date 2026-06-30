import type { IConnectionStore } from "../connection-service.ts";
import type { ActionPolicyService } from "../core/action-policy.ts";
import type { ActionDefinition, ActionExecutor, ProviderDefinition, ResolvedCredential } from "../core/types.ts";
import type { IOAuthClientConfigStore, OAuthClientConfig } from "../oauth/oauth-client-config-service.ts";
import type { IOAuthStateStore, OAuthAuthorizationState } from "../oauth/oauth-flow-service.ts";
import type { IProviderLoader } from "../providers/provider-loader.ts";
import type { IRunLogStore, RunLog } from "./runtime-store.ts";

import { describe, expect, it } from "vitest";
import { createCatalogStore } from "../catalog-store.ts";
import { ConnectionService } from "../connection-service.ts";
import { ActionPolicyService as LocalActionPolicyService } from "../core/action-policy.ts";
import { OAuthClientConfigService } from "../oauth/oauth-client-config-service.ts";
import { OAuthFlowService } from "../oauth/oauth-flow-service.ts";
import { ActionRunner } from "./action-runner.ts";
import { ConnectServer } from "./connect-server.ts";

const apiKeyProvider: ProviderDefinition = {
  service: "example",
  displayName: "Example",
  categories: ["Developer Tools"],
  authTypes: ["api_key"],
  auth: [{ type: "api_key" }],
  actions: [],
};

const echoAction: ActionDefinition = {
  id: "example.echo",
  service: "example",
  name: "echo",
  description: "Echo input.",
  requiredScopes: [],
  providerPermissions: [],
  inputSchema: { type: "object" },
  outputSchema: { type: "object" },
};

describe("ConnectServer", () => {
  it("serves catalog and standard connection errors without opening a port", async () => {
    const app = createTestServer([apiKeyProvider]).createApp();

    const catalogResponse = await app.request("/api/apps/example");
    await expect(catalogResponse.json()).resolves.toMatchObject({
      service: "example",
      displayName: "Example",
    });

    const connectionResponse = await app.request("/api/connections/example", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ authType: "api_key", values: {} }),
    });

    expect(connectionResponse.status).toBe(400);
    await expect(connectionResponse.json()).resolves.toEqual({
      error: {
        code: "invalid_input",
        message: "apiKey is required.",
      },
    });
  });

  it("requires a local API token when configured", async () => {
    const app = createTestServer([apiKeyProvider], {
      auth: { token: "local-token" },
    }).createApp();

    expect((await app.request("/health")).status).toBe(200);

    const unauthorized = await app.request("/api/apps/example");
    expect(unauthorized.status).toBe(401);
    await expect(unauthorized.json()).resolves.toEqual({
      error: {
        code: "unauthorized",
        message: "A valid local API token is required.",
      },
    });

    const authorized = await app.request("/api/apps/example", {
      headers: { authorization: "Bearer local-token" },
    });
    expect(authorized.status).toBe(200);
    await expect(authorized.json()).resolves.toMatchObject({
      service: "example",
    });
  });

  it("stores redacted run log summaries for HTTP action execution", async () => {
    const runs = new MemoryRunLogStore();
    const server = createTestServer(
      [
        {
          ...apiKeyProvider,
          actions: [echoAction],
        },
      ],
      {
        providerLoader: new EchoProviderLoader(),
        runs,
      },
    );
    const app = server.createApp();

    await app.request("/api/connections/example", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ authType: "api_key", values: { apiKey: "example-key" } }),
    });

    const response = await app.request("/api/run/example.echo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        input: {
          query: "hello",
          apiKey: "secret-key",
          nested: { password: "secret-password" },
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(runs.list()).toMatchObject([
      {
        actionId: "example.echo",
        caller: "http",
        ok: true,
        connectionProfile: {
          accountId: "example-account",
          displayName: "Example Account",
          grantedScopes: [],
        },
        inputSummary: {
          query: "hello",
          apiKey: "[redacted]",
          nested: { password: "[redacted]" },
        },
      },
    ]);
  });

  it("renders agent guides with current connection and provider permissions", async () => {
    const app = createTestServer(
      [
        {
          ...apiKeyProvider,
          actions: [
            {
              ...echoAction,
              requiredScopes: ["messages.read"],
              providerPermissions: ["messages:read"],
            },
          ],
        },
      ],
      {
        providerLoader: new EchoProviderLoader(),
      },
    ).createApp();

    await app.request("/api/connections/example", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ authType: "api_key", values: { apiKey: "example-key" } }),
    });

    const response = await app.request("/api/example.echo.md");

    expect(response.status).toBe(200);
    const markdown = await response.text();
    expect(markdown).toContain("## Current Connection");
    expect(markdown).toContain("Example Account");
    expect(markdown).toContain("`example-account`");
    expect(markdown).toContain("`messages:read`");
  });

  it("applies local action policy before executing HTTP actions", async () => {
    const runs = new MemoryRunLogStore();
    const app = createTestServer(
      [
        {
          ...apiKeyProvider,
          actions: [echoAction],
        },
      ],
      {
        actionPolicy: new LocalActionPolicyService({
          blockedActions: ["example.echo"],
        }),
        providerLoader: new EchoProviderLoader(),
        runs,
      },
    ).createApp();

    const response = await app.request("/api/run/example.echo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: {} }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: "action_blocked",
      },
    });
    expect(runs.list()).toMatchObject([
      {
        actionId: "example.echo",
        ok: false,
        errorCode: "action_blocked",
      },
    ]);
  });
});

interface CreateTestServerOptions {
  auth?: { token?: string };
  actionPolicy?: ActionPolicyService;
  providerLoader?: IProviderLoader;
  runs?: MemoryRunLogStore;
}

function createTestServer(providers: ProviderDefinition[], options: CreateTestServerOptions = {}): ConnectServer {
  const catalog = createCatalogStore(providers, {
    executableActionIds: ["example.echo"],
  });
  const providerLoader = options.providerLoader ?? new EmptyProviderLoader();
  const runs = options.runs ?? new MemoryRunLogStore();
  const connections = new ConnectionService({
    catalog,
    providerLoader,
    store: new MemoryConnectionStore(),
  });
  const clientConfigs = new OAuthClientConfigService({
    catalog,
    origin: "http://localhost:3000",
    store: new MemoryOAuthClientConfigStore(),
  });

  const actionRunner = new ActionRunner({
    catalog,
    providerLoader,
    connections,
    runs,
    actionPolicy: options.actionPolicy,
  });

  return new ConnectServer({
    catalog,
    providerLoader,
    connections,
    oauthClientConfigs: clientConfigs,
    oauthFlow: new OAuthFlowService({
      clientConfigs,
      connections,
      states: new MemoryOAuthStateStore(),
    }),
    actions: actionRunner,
    staticRoot: ".tmp/test-static",
    auth: options.auth,
    actionPolicy: options.actionPolicy,
  });
}

class EmptyProviderLoader implements IProviderLoader {
  async loadActionExecutor(): Promise<never> {
    throw new Error("No actions are available in this test.");
  }

  async loadCredentialValidators(): Promise<undefined> {
    return undefined;
  }
}

class EchoProviderLoader implements IProviderLoader {
  async loadActionExecutor(): Promise<ActionExecutor> {
    return async (input) => ({ ok: true, output: input });
  }

  async loadCredentialValidators(): Promise<{
    apiKey(): Promise<{
      profile: {
        accountId: string;
        displayName: string;
        grantedScopes: string[];
      };
    }>;
  }> {
    return {
      async apiKey() {
        return {
          profile: {
            accountId: "example-account",
            displayName: "Example Account",
            grantedScopes: [],
          },
        };
      },
    };
  }
}

class MemoryConnectionStore implements IConnectionStore {
  private readonly store = new Map<string, ResolvedCredential>();

  async get(service: string): Promise<ResolvedCredential | undefined> {
    return this.store.get(service);
  }

  async set(service: string, credential: ResolvedCredential): Promise<void> {
    this.store.set(service, credential);
  }

  async delete(service: string): Promise<void> {
    this.store.delete(service);
  }

  async list(): Promise<Array<{ service: string; credential: ResolvedCredential }>> {
    return [...this.store.entries()].map(([service, credential]) => ({ service, credential }));
  }
}

class MemoryOAuthClientConfigStore implements IOAuthClientConfigStore {
  private readonly configs = new Map<string, OAuthClientConfig>();

  async get(service: string): Promise<OAuthClientConfig | undefined> {
    return this.configs.get(service);
  }

  async set(config: OAuthClientConfig): Promise<void> {
    this.configs.set(config.service, config);
  }

  async delete(service: string): Promise<void> {
    this.configs.delete(service);
  }

  async list(): Promise<OAuthClientConfig[]> {
    return [...this.configs.values()];
  }
}

class MemoryOAuthStateStore implements IOAuthStateStore {
  async set(_state: OAuthAuthorizationState): Promise<void> {}

  async take(_state: string): Promise<OAuthAuthorizationState | undefined> {
    return undefined;
  }
}

class MemoryRunLogStore implements IRunLogStore {
  private readonly runs: RunLog[] = [];

  add(run: RunLog): void {
    this.runs.unshift(run);
  }

  list(): RunLog[] {
    return this.runs;
  }
}
