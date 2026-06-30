# Configuration

OOMOL Connect is configured with environment variables.

| Variable                           | Default                   | Purpose                                                                        |
| ---------------------------------- | ------------------------- | ------------------------------------------------------------------------------ |
| `PORT`                             | `3000`                    | Local HTTP server port.                                                        |
| `HOST`                             | `127.0.0.1`               | Bind address. Docker image sets `0.0.0.0`.                                     |
| `OOMOL_CONNECT_ORIGIN`             | `http://localhost:<PORT>` | Public origin used for OAuth redirect URLs.                                    |
| `OOMOL_CONNECT_DATA_DIR`           | `./data`                  | Directory containing `connect.sqlite`. Docker image sets `/app/data`.          |
| `OOMOL_CONNECT_ENCRYPTION_KEY`     | unset                     | Enables AES-256-GCM encryption for stored credentials and OAuth client config. |
| `OOMOL_CONNECT_NEW_ENCRYPTION_KEY` | unset                     | New key used by `runtime:data rotate-key`.                                     |
| `OOMOL_CONNECT_BACKUP_KEY`         | unset                     | Encrypts or decrypts runtime data backup files.                                |
| `OOMOL_CONNECT_API_TOKEN`          | unset                     | Requires bearer-token auth for API and MCP requests.                           |
| `OOMOL_CONNECT_ALLOWED_ACTIONS`    | unset                     | Comma-separated executable action allowlist. Supports `service.*`.             |
| `OOMOL_CONNECT_BLOCKED_ACTIONS`    | unset                     | Comma-separated executable action denylist. Supports `service.*`.              |

Example:

```bash
OOMOL_CONNECT_DATA_DIR="$PWD/data" \
OOMOL_CONNECT_ENCRYPTION_KEY="replace-with-a-long-random-secret" \
OOMOL_CONNECT_BACKUP_KEY="replace-with-another-long-random-secret" \
OOMOL_CONNECT_API_TOKEN="replace-with-a-local-token" \
OOMOL_CONNECT_ALLOWED_ACTIONS="hackernews.*,github.get_current_user" \
npm run dev
```
