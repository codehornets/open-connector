import type { CatalogStore } from "./catalog-store.ts";
import type {
  ApiKeyAuthDefinition,
  AuthType,
  CredentialDefinition,
  CredentialProfile,
  CredentialValidationResult,
  CustomCredentialAuthDefinition,
  ProviderDefinition,
  ResolvedCredential,
} from "./core/types.ts";
import type { IOAuthCredentialRefresher } from "./oauth/oauth-credential-refresh-service.ts";
import type { IProviderLoader } from "./providers/provider-loader.ts";

import { normalizeCredentialValues } from "./core/credential-fields.ts";

/**
 * Connection summary returned to the local console.
 */
export type ConnectionSummary = {
  service: string;
  authType: AuthType;
  configured: boolean;
  virtual: boolean;
  profile: CredentialProfile;
};

/**
 * Request body for local credential connections.
 */
export type ConnectWithCredentialInput = {
  values?: Record<string, unknown>;
};

/**
 * Storage contract for local provider connections.
 */
export interface IConnectionStore {
  get(service: string): Promise<ResolvedCredential | undefined>;
  set(service: string, credential: ResolvedCredential): Promise<void>;
  delete(service: string): Promise<void>;
  list(): Promise<Array<{ service: string; credential: ResolvedCredential }>>;
}

/**
 * Coordinates local provider connection state.
 *
 * No-auth providers are treated as virtual connections so open-source users can
 * run public actions without configuration.
 */
export class ConnectionService {
  private readonly catalog: CatalogStore;
  private readonly oauthCredentials?: IOAuthCredentialRefresher;
  private readonly providerLoader: IProviderLoader;
  private readonly store: IConnectionStore;

  constructor(input: {
    catalog: CatalogStore;
    oauthCredentials?: IOAuthCredentialRefresher;
    providerLoader: IProviderLoader;
    store: IConnectionStore;
  }) {
    this.catalog = input.catalog;
    this.oauthCredentials = input.oauthCredentials;
    this.providerLoader = input.providerLoader;
    this.store = input.store;
  }

  async listConnections(): Promise<ConnectionSummary[]> {
    const configured = new Map(
      (await this.store.list()).map((connection) => [connection.service, connection.credential]),
    );

    return this.catalog.providers
      .map((provider) => this.toConnectionSummary(provider, configured.get(provider.service)))
      .filter((summary): summary is ConnectionSummary => summary != null);
  }

  async getConnectionSummary(service: string): Promise<ConnectionSummary | undefined> {
    const provider = this.getProvider(service);
    return this.toConnectionSummary(provider, await this.store.get(service));
  }

  async getCredential(service: string): Promise<ResolvedCredential | undefined> {
    const provider = this.getProvider(service);
    const stored = await this.store.get(service);
    if (stored) {
      return stored.authType === "oauth2" ? await this.resolveOAuthCredential(service, stored) : stored;
    }

    return this.supportsAuth(provider, "no_auth") ? { authType: "no_auth" } : undefined;
  }

  async connectWithoutAuth(service: string): Promise<ConnectionSummary> {
    const provider = this.getProvider(service);
    if (!this.supportsAuth(provider, "no_auth")) {
      throw new ConnectionError("unsupported_auth_type", `${service} does not support no_auth.`);
    }

    return this.toConnectionSummary(provider, undefined)!;
  }

  async connectWithApiKey(service: string, input: ConnectWithCredentialInput): Promise<ConnectionSummary> {
    const provider = this.getProvider(service);
    if (!this.supportsAuth(provider, "api_key")) {
      throw new ConnectionError("unsupported_auth_type", `${service} does not support api_key.`);
    }

    const auth = this.getApiKeyDefinition(provider);
    const values = normalizeCredentialValues({
      fields: createApiKeyFields(auth),
      values: input.values ?? {},
      createError: (message) => new ConnectionError("invalid_input", message),
    });
    const apiKey = values.apiKey;

    const credential: ResolvedCredential = {
      authType: "api_key",
      apiKey,
      values,
      ...this.buildCredentialRuntimeData(
        provider,
        "api_key",
        values,
        await this.validateApiKeyCredential(service, { apiKey, values }),
      ),
    };
    await this.store.set(service, credential);

    return this.toConnectionSummary(provider, credential)!;
  }

  async connectWithCustomCredential(service: string, input: ConnectWithCredentialInput): Promise<ConnectionSummary> {
    const provider = this.getProvider(service);
    if (!this.supportsAuth(provider, "custom_credential")) {
      throw new ConnectionError("unsupported_auth_type", `${service} does not support custom_credential.`);
    }

    const auth = this.getCustomCredentialDefinition(provider);
    const values = normalizeCredentialValues({
      fields: auth.fields,
      values: input.values ?? {},
      createError: (message) => new ConnectionError("invalid_input", message),
    });
    const credential: ResolvedCredential = {
      authType: "custom_credential",
      values,
      ...this.buildCredentialRuntimeData(
        provider,
        "custom_credential",
        values,
        await this.validateCustomCredential(service, { values }),
      ),
    };
    await this.store.set(service, credential);

    return this.toConnectionSummary(provider, credential)!;
  }

  async setOAuthCredential(
    service: string,
    credential: Extract<ResolvedCredential, { authType: "oauth2" }>,
  ): Promise<ConnectionSummary> {
    const provider = this.getProvider(service);
    if (!this.supportsAuth(provider, "oauth2")) {
      throw new ConnectionError("unsupported_auth_type", `${service} does not support oauth2.`);
    }

    await this.store.set(service, {
      ...credential,
      ...this.mergeCredentialRuntimeData(
        provider,
        "oauth2",
        credential,
        await this.validateOAuthCredential(service, credential),
      ),
    });
    return this.toConnectionSummary(provider, await this.store.get(service))!;
  }

  async disconnect(service: string): Promise<ConnectionSummary | { service: string; configured: false }> {
    await this.store.delete(service);
    const provider = this.catalog.providers.find((provider) => provider.service === service);
    if (provider && this.supportsAuth(provider, "no_auth")) {
      return this.connectWithoutAuth(service);
    }

    return { service, configured: false };
  }

  private toConnectionSummary(
    provider: ProviderDefinition,
    credential: ResolvedCredential | undefined,
  ): ConnectionSummary | undefined {
    if (credential && credential.authType !== "no_auth") {
      return {
        service: provider.service,
        authType: credential.authType,
        configured: true,
        virtual: false,
        profile: credential.profile,
      };
    }

    if (this.supportsAuth(provider, "no_auth")) {
      return {
        service: provider.service,
        authType: "no_auth",
        configured: true,
        virtual: true,
        profile: this.createNoAuthProfile(provider),
      };
    }

    return undefined;
  }

  private getProvider(service: string): ProviderDefinition {
    const provider = this.catalog.providers.find((provider) => provider.service === service);
    if (!provider) {
      throw new ConnectionError("unknown_service", `Unknown service: ${service}.`);
    }

    return provider;
  }

  private supportsAuth(provider: ProviderDefinition, authType: AuthType): boolean {
    return provider.authTypes.includes(authType);
  }

  private getApiKeyDefinition(provider: ProviderDefinition): ApiKeyAuthDefinition {
    const auth = provider.auth.find((auth) => auth.type === "api_key");
    if (!auth || auth.type !== "api_key") {
      throw new ConnectionError("unsupported_auth_type", `${provider.service} does not support api_key.`);
    }

    return auth;
  }

  private getCustomCredentialDefinition(provider: ProviderDefinition): CustomCredentialAuthDefinition {
    const auth = provider.auth.find((auth) => auth.type === "custom_credential");
    if (!auth || auth.type !== "custom_credential") {
      throw new ConnectionError("unsupported_auth_type", `${provider.service} does not support custom_credential.`);
    }

    return auth;
  }

  private async validateApiKeyCredential(
    service: string,
    input: { apiKey: string; values: Record<string, string> },
  ): Promise<CredentialValidationResult> {
    const validators = await this.providerLoader.loadCredentialValidators(service);
    return this.runCredentialValidator(service, () => validators?.apiKey?.(input, { fetcher: fetch }));
  }

  private async validateCustomCredential(
    service: string,
    input: { values: Record<string, string> },
  ): Promise<CredentialValidationResult> {
    const validators = await this.providerLoader.loadCredentialValidators(service);
    return this.runCredentialValidator(service, () => validators?.customCredential?.(input, { fetcher: fetch }));
  }

  private async validateOAuthCredential(
    service: string,
    credential: Extract<ResolvedCredential, { authType: "oauth2" }>,
  ): Promise<CredentialValidationResult> {
    const validators = await this.providerLoader.loadCredentialValidators(service);
    return this.runCredentialValidator(service, () => validators?.oauth2?.(credential, { fetcher: fetch }));
  }

  private async resolveOAuthCredential(
    service: string,
    credential: Extract<ResolvedCredential, { authType: "oauth2" }>,
  ): Promise<Extract<ResolvedCredential, { authType: "oauth2" }>> {
    if (!isOAuthCredentialExpired(credential)) {
      return credential;
    }

    if (!credential.refreshToken) {
      throw new ConnectionError(
        "oauth_token_expired",
        `${service} OAuth access token expired and no refresh token is available. Reconnect ${service}.`,
      );
    }

    if (!this.oauthCredentials) {
      throw new ConnectionError(
        "oauth_refresh_unavailable",
        `${service} OAuth access token expired and this runtime cannot refresh it.`,
      );
    }

    const nextCredential = await this.oauthCredentials.refresh(service, credential);
    await this.store.set(service, nextCredential);
    return nextCredential;
  }

  private async runCredentialValidator(
    service: string,
    validate: () => Promise<{ metadata?: Record<string, unknown> } | void> | undefined,
  ): Promise<CredentialValidationResult> {
    try {
      return (await validate()) ?? {};
    } catch (error) {
      throw new ConnectionError(
        "credential_verification_failed",
        error instanceof Error ? error.message : `${service} credential verification failed.`,
      );
    }
  }

  private buildCredentialRuntimeData(
    provider: ProviderDefinition,
    authType: Exclude<AuthType, "no_auth">,
    credentialValues: Record<string, string>,
    validation: CredentialValidationResult,
  ): { profile: CredentialProfile; metadata: Record<string, unknown> } {
    return {
      profile: this.createCredentialProfile(provider, authType, credentialValues, validation),
      metadata: validation.metadata ?? {},
    };
  }

  private mergeCredentialRuntimeData(
    provider: ProviderDefinition,
    authType: Exclude<AuthType, "no_auth">,
    credential: Extract<ResolvedCredential, { authType: "oauth2" }>,
    validation: CredentialValidationResult,
  ): { profile: CredentialProfile; metadata: Record<string, unknown> } {
    return {
      profile: this.createCredentialProfile(provider, authType, {}, validation, {
        profile: credential.profile,
        metadata: credential.metadata,
      }),
      metadata: {
        ...credential.metadata,
        ...(validation.metadata ?? {}),
      },
    };
  }

  private createCredentialProfile(
    provider: ProviderDefinition,
    authType: Exclude<AuthType, "no_auth">,
    credentialValues: Record<string, string>,
    validation: CredentialValidationResult,
    previous?: { profile: CredentialProfile; metadata: Record<string, unknown> },
  ): CredentialProfile {
    const accountId =
      validation.profile?.accountId ??
      readLegacyString(validation.metadata, "providerAccountId") ??
      readLegacyString(validation.metadata, "accountId") ??
      previous?.profile.accountId ??
      this.createDefaultAccountId(provider, authType, credentialValues);
    const displayName =
      validation.profile?.displayName ??
      readLegacyString(validation.metadata, "accountLabel") ??
      readLegacyString(validation.metadata, "displayName") ??
      previous?.profile.displayName ??
      this.createDefaultDisplayName(provider, authType);

    const grantedScopes =
      validation.profile?.grantedScopes ??
      validation.grantedScopes ??
      parseScopeString(readLegacyString(validation.metadata, "scope")) ??
      parseScopeString(readLegacyString(previous?.metadata, "scope")) ??
      previous?.profile.grantedScopes;

    return {
      accountId,
      displayName,
      grantedScopes: normalizeGrantedScopes(grantedScopes),
    };
  }

  private createNoAuthProfile(provider: ProviderDefinition): CredentialProfile {
    return {
      accountId: `${provider.service}:public`,
      displayName: `${provider.displayName} Public`,
      grantedScopes: [],
    };
  }

  private createDefaultAccountId(
    provider: ProviderDefinition,
    authType: Exclude<AuthType, "no_auth">,
    credentialValues: Record<string, string>,
  ): string {
    const visibleValues = Object.entries(credentialValues)
      .filter(([key]) => key !== "apiKey")
      .map(([key, value]) => `${key}:${value}`);
    return visibleValues.length > 0
      ? `${provider.service}:${visibleValues.join(":")}`
      : `${provider.service}:${authType}`;
  }

  private createDefaultDisplayName(provider: ProviderDefinition, authType: Exclude<AuthType, "no_auth">): string {
    return `${provider.displayName} ${authType === "api_key" ? "API Key" : "Credential"}`;
  }
}

function isOAuthCredentialExpired(credential: Extract<ResolvedCredential, { authType: "oauth2" }>): boolean {
  if (!credential.expiresAt) {
    return false;
  }

  const expiresAt = Date.parse(credential.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= Date.now() + 60_000;
}

function createApiKeyFields(auth: ApiKeyAuthDefinition): CredentialDefinition[] {
  return [
    {
      key: "apiKey",
      label: auth.label ?? "API key",
      inputType: "password",
      required: true,
      secret: true,
      placeholder: auth.placeholder,
      description: auth.description,
    },
    ...(auth.extraFields ?? []),
  ];
}

function normalizeGrantedScopes(value: string[] | undefined): string[] {
  return [...new Set((value ?? []).map((scope) => scope.trim()).filter(Boolean))];
}

function parseScopeString(value: string | undefined): string[] | undefined {
  return value ? value.split(/[,\s]+/) : undefined;
}

function readLegacyString(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Error with a stable code suitable for HTTP responses.
 */
export class ConnectionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
