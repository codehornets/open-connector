import type { CatalogStore } from "../catalog-store.ts";
import type { ConnectionService } from "../connection-service.ts";
import type { ActionPolicyService } from "../core/action-policy.ts";
import type { IProviderLoader } from "../providers/provider-loader.ts";
import type { LocalAuthOptions } from "./auth.ts";
import type { Context } from "hono";

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Scalar } from "@scalar/hono-api-reference";
import { Hono } from "hono";
import { ConnectionError } from "../connection-service.ts";
import { optionalRecord, optionalString, requiredString } from "../core/cast.ts";
import { createMcpServer, listMcpToolSummaries } from "../mcp.ts";
import { OAuthClientConfigError, OAuthClientConfigService } from "../oauth/oauth-client-config-service.ts";
import { OAuthFlowError, OAuthFlowService } from "../oauth/oauth-flow-service.ts";
import { renderActionMarkdown } from "./action-markdown.ts";
import { ActionRunner } from "./action-runner.ts";
import { createLocalAuthMiddleware, installLocalAuthCookie } from "./auth.ts";
import { escapeHtml, internalError, jsonError, notFound, readJsonBody } from "./http-utils.ts";
import { createOpenApiDocument } from "./openapi.ts";
import { registerStaticRoutes } from "./static-routes.ts";

/**
 * Dependencies required to construct the local connector server.
 */
export interface IConnectServerOptions {
  catalog: CatalogStore;
  providerLoader: IProviderLoader;
  connections: ConnectionService;
  oauthClientConfigs: OAuthClientConfigService;
  oauthFlow: OAuthFlowService;
  actions: ActionRunner;
  staticRoot: string;
  auth?: LocalAuthOptions;
  actionPolicy?: ActionPolicyService;
}

/**
 * Local single-user HTTP server for catalog browsing, credential management,
 * action execution, OpenAPI docs, and MCP tool metadata.
 */
export class ConnectServer {
  private readonly options: IConnectServerOptions;

  constructor(options: IConnectServerOptions) {
    this.options = options;
  }

  createApp(): Hono {
    const app = new Hono();
    const auth = this.options.auth ?? {};

    app.get("/health", (context) => context.json({ ok: true }));
    app.use("*", createLocalAuthMiddleware(auth));
    app.get("/openapi.json", (context) =>
      context.json(
        createOpenApiDocument(this.options.catalog.providers, {
          actionId: optionalString(context.req.query("actionId")),
        }),
      ),
    );
    app.get(
      "/docs",
      Scalar({
        pageTitle: "OOMOL Connect API Reference",
        url: "/openapi.json",
        theme: "default",
        darkMode: false,
        forceDarkModeState: "light",
        customCss: `
          :root {
            --scalar-color-accent: rgb(59, 99, 251);
            --scalar-background-accent: rgba(59, 99, 251, 0.12);
          }
        `,
      }),
    );

    app.get("/api/apps", (context) => context.json(this.options.catalog.providers));
    app.get("/api/apps/:service", (context) => this.getProvider(context, context.req.param("service")));

    app.get("/api/actions", (context) => context.json(this.options.catalog.actions));
    app.get("/api/actions/:actionId", (context) => this.getAction(context, context.req.param("actionId")));
    app.get("/api/:guideFile{.+\\.md}", (context) =>
      this.getActionMarkdown(context, readMarkdownActionId(context.req.param("guideFile"))),
    );

    app.get("/api/connections", (context) => this.listConnections(context));
    app.put("/api/connections/:service", (context) => this.upsertConnection(context, context.req.param("service")));
    app.delete("/api/connections/:service", (context) => this.disconnect(context, context.req.param("service")));

    app.get("/api/runs", (context) => context.json(this.options.actions.listRuns()));
    app.post("/api/run/:actionId", (context) => this.createRun(context, context.req.param("actionId")));
    app.get("/api/oauth/configs", (context) => this.listOAuthConfigs(context));
    app.put("/api/oauth/configs/:service", (context) => this.upsertOAuthConfig(context, context.req.param("service")));
    app.delete("/api/oauth/configs/:service", (context) =>
      this.deleteOAuthConfig(context, context.req.param("service")),
    );
    app.post("/api/oauth/authorizations", (context) => this.createOAuthAuthorization(context));
    app.get("/oauth/callback/:service", (context) => this.completeOAuth(context, context.req.param("service")));
    app.all("/mcp", (context) => this.handleMcp(context));
    app.get("/mcp/tools", (context) => context.json({ tools: listMcpToolSummaries() }));

    app.use("*", async (context, next) => {
      installLocalAuthCookie(context, auth);
      await next();
    });
    registerStaticRoutes(app, this.options.staticRoot);
    app.onError((error, context) => internalError(context, error));

    return app;
  }

  private getProvider(context: Context, service: string): Response {
    const provider = this.options.catalog.providers.find((provider) => provider.service === service);
    if (!provider) {
      return notFound(context);
    }

    return context.json(provider);
  }

  private getAction(context: Context, actionId: string): Response {
    const action = this.options.catalog.actionsById.get(actionId);
    if (!action) {
      return notFound(context);
    }

    return context.json(action);
  }

  private async getActionMarkdown(context: Context, actionId: string): Promise<Response> {
    const action = this.options.catalog.actionsById.get(actionId);
    if (!action) {
      return notFound(context);
    }

    return context.text(
      renderActionMarkdown(action, {
        connection: await this.options.connections.getConnectionSummary(action.service),
        providerPermissions: action.providerPermissions,
      }),
      200,
      {
        "content-type": "text/markdown; charset=utf-8",
      },
    );
  }

  private async createRun(context: Context, actionId: string): Promise<Response> {
    const action = this.options.catalog.actionsById.get(actionId);
    if (!action) {
      return notFound(context);
    }

    const body = await readJsonBody(context);
    const result = await this.options.actions.run({
      actionId,
      input: body.input ?? {},
      caller: "http",
    });
    if (!result) {
      return notFound(context);
    }

    return context.json(result, result.ok ? 200 : 400);
  }

  private async handleMcp(context: Context): Promise<Response> {
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    const server = createMcpServer({
      catalog: this.options.catalog,
      providerLoader: this.options.providerLoader,
      connections: this.options.connections,
      actions: this.options.actions,
      actionPolicy: this.options.actionPolicy,
    });

    await server.connect(transport);
    try {
      return await transport.handleRequest(context.req.raw);
    } finally {
      await server.close();
    }
  }

  private async listConnections(context: Context): Promise<Response> {
    return context.json(await this.options.connections.listConnections());
  }

  private async upsertConnection(context: Context, service: string): Promise<Response> {
    const body = await readJsonBody(context);
    const authType = optionalString(body.authType);
    if (!authType) {
      return jsonError(context, 400, "invalid_input", "authType is required.");
    }

    const values = body.values ?? body;
    if (authType === "no_auth") {
      return this.writeConnectionResult(context, this.options.connections.connectWithoutAuth(service));
    }
    if (authType === "api_key") {
      return this.writeConnectionResult(context, this.options.connections.connectWithApiKey(service, { values }));
    }
    if (authType === "custom_credential") {
      return this.writeConnectionResult(
        context,
        this.options.connections.connectWithCustomCredential(service, { values }),
      );
    }

    return jsonError(context, 400, "unsupported_auth_type", `${service} does not support ${authType}.`);
  }

  private async disconnect(context: Context, service: string): Promise<Response> {
    return this.writeConnectionResult(context, this.options.connections.disconnect(service));
  }

  private async createOAuthAuthorization(context: Context): Promise<Response> {
    const body = await readJsonBody(context);
    try {
      const service = requiredString(
        body.service,
        "service",
        (message) => new OAuthFlowError("invalid_input", message),
      );
      return await this.writeOAuthResult(context, this.options.oauthFlow.startAuthorization(service));
    } catch (error) {
      if (error instanceof OAuthFlowError) {
        return jsonError(context, error.code === "unknown_service" ? 404 : 400, error.code, error.message);
      }

      throw error;
    }
  }

  private async listOAuthConfigs(context: Context): Promise<Response> {
    return context.json(await this.options.oauthClientConfigs.listConfigs());
  }

  private async upsertOAuthConfig(context: Context, service: string): Promise<Response> {
    const body = await readJsonBody(context);
    return this.writeOAuthResult(
      context,
      this.options.oauthClientConfigs.upsertConfig({
        service,
        clientId: optionalString(body.clientId) ?? "",
        clientSecret: optionalString(body.clientSecret) ?? "",
        extra: optionalRecord(body.extra),
      }),
    );
  }

  private async deleteOAuthConfig(context: Context, service: string): Promise<Response> {
    return this.writeOAuthResult(context, this.options.oauthClientConfigs.deleteConfig(service));
  }

  private async completeOAuth(context: Context, service: string): Promise<Response> {
    const state = context.req.query("state");
    const code = context.req.query("code");
    if (!state || !code) {
      return jsonError(context, 400, "invalid_oauth_callback", "OAuth callback requires state and code.");
    }

    const result = await this.writeOAuthResult(context, this.options.oauthFlow.completeAuthorization({ state, code }));
    if (result.status >= 400) {
      return result;
    }

    return context.html(
      `<html><body><h1>Connected ${escapeHtml(service)}</h1><p>You can close this window and return to OOMOL Connect.</p></body></html>`,
    );
  }

  private async writeConnectionResult(context: Context, operation: Promise<unknown>): Promise<Response> {
    try {
      return context.json(await operation);
    } catch (error) {
      if (error instanceof ConnectionError) {
        return jsonError(context, error.code === "unknown_service" ? 404 : 400, error.code, error.message);
      }

      throw error;
    }
  }

  private async writeOAuthResult(context: Context, operation: Promise<unknown>): Promise<Response> {
    try {
      return context.json(await operation);
    } catch (error) {
      if (error instanceof OAuthClientConfigError || error instanceof OAuthFlowError) {
        return jsonError(context, error.code === "unknown_service" ? 404 : 400, error.code, error.message);
      }

      throw error;
    }
  }
}

function readMarkdownActionId(filename: string): string {
  return filename.endsWith(".md") ? filename.slice(0, -3) : filename;
}
