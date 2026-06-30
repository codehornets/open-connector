# OOMOL Connect

OOMOL Connect is a local-first connector and action server for browsing app/action catalogs,
configuring local credentials, testing actions, and exposing actions to agents through HTTP and MCP.

The project is built for agent integrations: keep credentials local, expose typed app actions, and
run those actions through direct HTTP calls or MCP-compatible agents.

Instead of giving agents raw provider tokens, OOMOL Connect gives them action schemas and a local
execution boundary.

## What Is Included

- Local app and action catalog browsing
- Local credential configuration
- Agent-visible connection identity and provider scope metadata
- SQLite-backed local runtime storage
- Action execution through HTTP
- MCP endpoint and tool metadata for agents
- Optional bearer-token gate for local HTTP and MCP access
- Optional action allow/block policy for agent execution
- OpenAPI reference at `/docs`
- A Vite local console under `web/`
- Provider definitions that can be catalog-only or locally executable
- Lazy provider executor loading

## Quick Start

```bash
npm install
npm run generate:catalog
npm test
npm run dev
```

Open the API reference:

```text
http://localhost:3000/docs
```

Try a Hacker News action:

```bash
curl -s http://localhost:3000/api/actions/hackernews.get_top_stories \
  -H 'content-type: application/json' \
  -d '{"input":{}}'
```

To serve the local web console from the same runtime, build it first:

```bash
npm run build:web
npm run dev
```

Then open:

```text
http://localhost:3000
```

Runtime state is stored in `./data/connect.sqlite` by default. Use `OOMOL_CONNECT_DATA_DIR` to point
the local database somewhere else.

Set `OOMOL_CONNECT_ENCRYPTION_KEY` to encrypt stored credentials and OAuth client secrets.
Set `OOMOL_CONNECT_API_TOKEN` to require `Authorization: Bearer <token>` for API and MCP requests.
Use `OOMOL_CONNECT_ALLOWED_ACTIONS` and `OOMOL_CONNECT_BLOCKED_ACTIONS` to constrain which actions
agents can execute.

Agents can inspect provider capabilities before execution. Action catalog entries include provider
scopes and permissions, connection summaries include the current provider account identity, and run
logs record which account profile was used.

## Project Layout

```text
src/
  core/                     Core provider/action contracts and validation
  connections/              Local connection and credential handling
  oauth/                    Local OAuth client configuration and callback flow
  providers/                Provider definitions and lazy-loaded executors
  server/                   Local HTTP server
web/                        Vite local console package
catalog/apps/               Generated public catalog JSON
examples/                   Runnable local examples
scripts/                    Catalog and registry generation tools
.codex/skills/add-provider/ Agent-readable provider contribution workflow
docs/                       User and contributor documentation
```

## Development

```bash
npm run generate:catalog
npm run lint
npm run format
npm test
npm run build
```

Formatting and linting use `oxfmt` and `oxlint`.

## Adding Providers

Provider code lives under `src/providers/<service>`.

Use the provider contribution skill:

[.codex/skills/add-provider/SKILL.md](.codex/skills/add-provider/SKILL.md)

Typical provider workflow:

```bash
npm run generate:catalog
npm test
npm run build
```

Provider definitions generate catalog JSON. Provider executors are loaded only when one of that
provider's actions is executed.

## API

The local server currently exposes:

- `GET /health`
- `GET /api/apps`
- `GET /api/apps/:service`
- `GET /api/actions`
- `GET /api/actions/:actionId`
- `POST /api/actions/:actionId`
- `GET /api/connections`
- `POST /api/connections/:service/no-auth`
- `PUT /api/connections/:service/api-key`
- `PUT /api/connections/:service/custom-credential`
- `POST /api/connections/:service/oauth/start`
- `DELETE /api/connections/:service`
- `GET /api/oauth/configs`
- `PUT /api/oauth/configs/:service`
- `DELETE /api/oauth/configs/:service`
- `GET /oauth/callback/:service`
- `GET /api/runs`
- `POST /mcp`
- `GET /mcp/tools`
- `GET /openapi.json`

Credential request fields are declared by each provider's catalog `auth` metadata. The runtime
rejects unknown credential fields and required fields with empty values so local scripts, future UI
forms, and provider definitions stay aligned.

Credential validators may attach a stable connection profile with `accountId`, `displayName`, and
known `grantedScopes`. This profile is safe to expose in `/api/connections`, MCP action discovery,
agent guides, and recent run logs.

## Documentation

- [Quickstart](docs/quickstart.md)
- [Configuration](docs/configuration.md)
- [Catalog format](docs/catalog-format.md)
- [Credentials](docs/credentials.md)
- [Verification language](docs/verification.md)
- [Contributing](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security](SECURITY.md)

## License Scope

Unless otherwise noted, the source code, scripts, generated project scaffolding, tests, and
documentation authored for this repository are licensed under the Apache License, Version 2.0. See
[LICENSE.txt](LICENSE.txt).

The Apache-2.0 license for this repository does not grant rights to third-party products,
providers, apps, APIs, trademarks, service marks, trade names, logos, icons, brand assets,
documentation, screenshots, or other copyrighted materials owned by their respective holders.

Provider and app names, metadata, links, scopes, permissions, and optional logos/icons are included
only to identify services and enable interoperability. All third-party brand and product rights
remain with their respective owners. Inclusion in this catalog does not imply endorsement,
sponsorship, partnership, certification, or verification by those owners.

If you contribute provider metadata or assets, only submit material you have the right to submit.
Prefer linking to official public assets instead of copying brand files into this repository.

## Community

Please keep issues and pull requests focused, respectful, and actionable. Participation in this
project is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
