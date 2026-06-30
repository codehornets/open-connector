# Credentials And Local Storage

The local runtime stores connections, OAuth client configuration, pending OAuth states, and recent
run logs in SQLite.

By default the database lives at:

```text
./data/connect.sqlite
```

Set `OOMOL_CONNECT_DATA_DIR` to use another directory. The Docker image defaults this to
`/app/data`, which is intended to be mounted as a volume.

- `no_auth` providers are available as virtual connections and do not store secrets.
- `api_key` and `custom_credential` providers store their local secrets in SQLite.
- `oauth2` providers use user-provided OAuth client configuration and a localhost callback URL.

## Encryption

Set `OOMOL_CONNECT_ENCRYPTION_KEY` to encrypt stored credentials and OAuth client secrets:

```bash
OOMOL_CONNECT_ENCRYPTION_KEY="replace-with-a-long-random-secret" npm run dev
```

The runtime uses AES-256-GCM for records that contain provider credentials or OAuth client
configuration. The key is not stored by OOMOL Connect; if it is lost, encrypted records cannot be
recovered.

Without `OOMOL_CONNECT_ENCRYPTION_KEY`, the runtime stays usable for local development and prints a
startup warning. In that mode, treat `connect.sqlite` as a sensitive local file.

## Credential fields

Credential fields are declared by each provider's catalog `auth` metadata. The runtime treats that
metadata as the contract for local API requests:

- `api_key` connections always require `values.apiKey`.
- `api_key` connections may declare additional `extraFields`.
- `custom_credential` connections require exactly the provider-declared `fields`.
- `oauth2` client config may declare additional `clientConfigFields`.

All submitted string values are trimmed. Empty strings are treated as missing. Unknown submitted
fields are rejected instead of being silently stored, because credential forms, scripts, and provider
definitions should fail fast when they drift.

## Connection identity

When a provider can cheaply validate credentials against a current-user or current-account endpoint,
its validator stores a stable connection profile:

- `accountId`: provider-side user, workspace, bot, account, or token identifier.
- `displayName`: human-readable account label.
- `grantedScopes`: provider-native scopes granted to the credential, when known.

The runtime exposes this profile in `/api/connections`, MCP action discovery, action agent guides,
and recent run logs. Agents should use it to understand which account an action will run as; raw
provider tokens are never exposed.

## API key example

```bash
curl -s -X PUT http://localhost:3000/api/connections/example/api-key \
  -H 'content-type: application/json' \
  -d '{"values":{"apiKey":"...","accountId":"..."}}'
```

The accepted keys are `apiKey` plus the provider's `auth[].extraFields`.

## Custom credential example

```bash
curl -s -X PUT http://localhost:3000/api/connections/example/custom-credential \
  -H 'content-type: application/json' \
  -d '{"values":{"host":"localhost","password":"..."}}'
```

The accepted keys come from the provider's `auth[].fields`.

## OAuth client configuration

Open-source users provide their own provider OAuth app. Configure that app to redirect back to the
`expectedRedirectUri` returned by:

```bash
curl -s http://localhost:3000/api/oauth/configs
```

Then store the local client configuration:

```bash
curl -s -X PUT http://localhost:3000/api/oauth/configs/example \
  -H 'content-type: application/json' \
  -d '{"clientId":"...","clientSecret":"...","extra":{"tenant":"..."}}'
```

Start authorization with:

```bash
curl -s -X POST http://localhost:3000/api/connections/example/oauth/start
```

Open the returned `authorizationUrl` in a browser and finish the provider callback.

Protect the local SQLite database like any other file containing API keys or OAuth tokens.

## Backup, Import, And Reset

Export encrypted runtime data:

```bash
OOMOL_CONNECT_BACKUP_KEY="replace-with-a-long-random-secret" \
npm run runtime:data -- export --output ./backup/oomol-connect-runtime.json
```

Import an encrypted backup into the configured data directory:

```bash
OOMOL_CONNECT_BACKUP_KEY="replace-with-a-long-random-secret" \
npm run runtime:data -- import --input ./backup/oomol-connect-runtime.json
```

Reset local runtime data:

```bash
npm run runtime:data -- reset --yes
```

Backups include local connections, OAuth client configuration, and recent run logs. Pending OAuth
callback states are intentionally not exported.

Plaintext export is available only when explicitly requested:

```bash
npm run runtime:data -- export --output ./backup/plain-runtime.json --plain
```

Rotate the local SQLite credential encryption key:

```bash
OOMOL_CONNECT_ENCRYPTION_KEY="old-secret" \
OOMOL_CONNECT_NEW_ENCRYPTION_KEY="new-secret" \
npm run runtime:data -- rotate-key
```

Remove local SQLite credential encryption only when you intentionally want plaintext local storage:

```bash
OOMOL_CONNECT_ENCRYPTION_KEY="old-secret" \
npm run runtime:data -- rotate-key --plain
```

## OAuth Token Refresh

OAuth access tokens are refreshed automatically when they are expired and the provider issued a
refresh token. Refreshed credentials are written back to the local SQLite store, using encryption
when `OOMOL_CONNECT_ENCRYPTION_KEY` is configured.

If a token is expired and no refresh token is available, reconnect the provider from the local
runtime. Providers such as Google may require authorization parameters that request offline access;
provider definitions should include those parameters when refresh tokens are expected.

## Local API Access

The server binds to `127.0.0.1` by default. Set `HOST=0.0.0.0` only when the runtime must be
reachable from outside the local machine or container.

Set `OOMOL_CONNECT_API_TOKEN` to require bearer-token authentication for API and MCP requests:

```bash
OOMOL_CONNECT_API_TOKEN="replace-with-a-local-token" npm run dev
```

Then external clients should send:

```text
Authorization: Bearer replace-with-a-local-token
```

The bundled web console receives a same-site local cookie from the runtime so it can keep working
when API-token authentication is enabled.

## Action Policy

Use `OOMOL_CONNECT_ALLOWED_ACTIONS` to expose only selected actions to HTTP and MCP execution:

```bash
OOMOL_CONNECT_ALLOWED_ACTIONS="hackernews.*,github.get_current_user" npm run dev
```

Use `OOMOL_CONNECT_BLOCKED_ACTIONS` to deny specific actions even when a broader allowlist includes
them:

```bash
OOMOL_CONNECT_ALLOWED_ACTIONS="github.*" \
OOMOL_CONNECT_BLOCKED_ACTIONS="github.delete_repository" \
npm run dev
```

Entries are comma-separated action ids. A provider-wide wildcard such as `gmail.*` matches all
actions for that provider.
