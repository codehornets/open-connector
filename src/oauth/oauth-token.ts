import type { ResolvedCredential } from "../core/types.ts";

import { optionalString, requiredString } from "../core/cast.ts";

export interface OAuthTokenRequestOptions {
  clientId: string;
  clientSecret: string;
  tokenEndpointAuthMethod: "client_secret_basic" | "client_secret_post" | "none";
  tokenRequestFormat?: "form" | "json";
  tokenUrl: string;
}

interface AuthorizationCodeTokenRequest extends OAuthTokenRequestOptions {
  code: string;
  redirectUri: string;
  createError: OAuthTokenErrorFactory;
}

interface RefreshTokenRequest extends OAuthTokenRequestOptions {
  refreshToken: string;
  createError: OAuthTokenErrorFactory;
}

interface TokenRequest extends OAuthTokenRequestOptions {
  fields: Record<string, string>;
  createError: OAuthTokenErrorFactory;
}

export type OAuthTokenErrorFactory = (message: string) => Error;

export async function requestAuthorizationCodeToken(
  input: AuthorizationCodeTokenRequest,
): Promise<Extract<ResolvedCredential, { authType: "oauth2" }>> {
  return requestToken({
    ...input,
    fields: {
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: input.redirectUri,
    },
  });
}

export async function requestRefreshToken(
  input: RefreshTokenRequest,
): Promise<Extract<ResolvedCredential, { authType: "oauth2" }>> {
  return requestToken({
    ...input,
    fields: {
      grant_type: "refresh_token",
      refresh_token: input.refreshToken,
    },
  });
}

async function requestToken(input: TokenRequest): Promise<Extract<ResolvedCredential, { authType: "oauth2" }>> {
  const fields: Record<string, string> = {
    ...input.fields,
    client_id: input.clientId,
  };
  const headers: Record<string, string> = {
    accept: "application/json",
  };
  let body: BodyInit;

  if (input.tokenEndpointAuthMethod === "client_secret_basic") {
    headers.authorization = `Basic ${btoa(`${input.clientId}:${input.clientSecret}`)}`;
  } else if (input.tokenEndpointAuthMethod === "client_secret_post" && input.tokenRequestFormat !== "json") {
    fields.client_secret = input.clientSecret;
  }

  if (input.tokenRequestFormat === "json") {
    headers["content-type"] = "application/json";
    body = JSON.stringify(fields);
  } else {
    headers["content-type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(fields);
  }

  const response = await fetch(input.tokenUrl, {
    method: "POST",
    headers,
    body,
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw input.createError(
      typeof payload.error_description === "string" ? payload.error_description : "OAuth token request failed.",
    );
  }

  const accessToken = requiredString(payload.access_token, "access_token", input.createError);
  const tokenType = optionalString(payload.token_type) ?? "Bearer";
  const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : undefined;
  return {
    authType: "oauth2",
    accessToken,
    tokenType,
    refreshToken: optionalString(payload.refresh_token),
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : undefined,
    profile: {
      accountId: "oauth2",
      displayName: "OAuth Credential",
      grantedScopes: [],
    },
    metadata: {
      rawTokenType: payload.token_type,
      scope: payload.scope,
    },
  };
}
