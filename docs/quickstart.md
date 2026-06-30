# Quickstart

Install dependencies and generate the local catalog:

```bash
npm install
npm run generate:catalog
npm run build
npm run dev
```

Open the API reference at `http://localhost:3000/docs`.

Run a no-auth action:

```bash
curl -s http://localhost:3000/api/actions/hackernews.get_top_stories \
  -H 'content-type: application/json' \
  -d '{"input":{}}'
```

List MCP tool metadata:

```bash
curl -s http://localhost:3000/mcp/tools
```

Inspect local connections and the account identity exposed to users and agents:

```bash
curl -s http://localhost:3000/api/connections
```

Get a compact action guide with required scopes, provider permissions, current connection identity,
and HTTP execution examples:

```bash
curl -s http://localhost:3000/api/actions/hackernews.get_top_stories/agent.md
```

The web console is served at `http://localhost:3000` after building the `web` workspace:

```bash
npm run build:web
npm run dev
```

Local runtime state is stored in `./data/connect.sqlite` by default. Override the directory with:

```bash
OOMOL_CONNECT_DATA_DIR=/path/to/data npm run dev
```

With Docker Compose, the bundled `connector-data` volume is mounted at `/app/data`.

Set `OOMOL_CONNECT_ENCRYPTION_KEY` to encrypt stored credentials:

```bash
OOMOL_CONNECT_ENCRYPTION_KEY="replace-with-a-long-random-secret" npm run dev
```

Set `OOMOL_CONNECT_API_TOKEN` to require a bearer token for API and MCP requests:

```bash
OOMOL_CONNECT_API_TOKEN="replace-with-a-local-token" npm run dev
curl -s http://localhost:3000/api/actions \
  -H "authorization: Bearer replace-with-a-local-token"
```

The server binds to `127.0.0.1` by default. Set `HOST=0.0.0.0` only when the runtime must be
reachable from outside the local machine or container.

Constrain executable actions with comma-separated action ids or provider wildcards:

```bash
OOMOL_CONNECT_ALLOWED_ACTIONS="hackernews.*,github.get_current_user" npm run dev
```

Export an encrypted local backup:

```bash
OOMOL_CONNECT_BACKUP_KEY="replace-with-a-long-random-secret" \
npm run runtime:data -- export --output ./backup/oomol-connect-runtime.json
```
