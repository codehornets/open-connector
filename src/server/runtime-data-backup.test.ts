import { describe, expect, it } from "vitest";
import { decodeRuntimeDataBackup, encodeRuntimeDataBackup, createRuntimeDataSnapshot } from "./runtime-data-backup.ts";

describe("runtime data backup format", () => {
  it("round-trips plaintext backups", () => {
    const snapshot = createRuntimeDataSnapshot({
      exportedAt: "2026-06-30T00:00:00.000Z",
      connections: [],
      oauthClientConfigs: [],
      runs: [],
    });
    const backup = encodeRuntimeDataBackup({ snapshot });

    expect(backup.encryption.mode).toBe("none");
    expect(decodeRuntimeDataBackup({ backup })).toEqual(snapshot);
  });

  it("encrypts backup payloads with a separate backup key", () => {
    const snapshot = createRuntimeDataSnapshot({
      exportedAt: "2026-06-30T00:00:00.000Z",
      connections: [
        {
          service: "github",
          credential: {
            authType: "api_key",
            apiKey: "github-token",
            values: { apiKey: "github-token" },
            profile: {
              accountId: "github:octocat",
              displayName: "octocat",
              grantedScopes: [],
            },
            metadata: {},
          },
        },
      ],
      oauthClientConfigs: [],
      runs: [],
    });
    const backup = encodeRuntimeDataBackup({ snapshot, backupKey: "backup-key" });

    expect(backup.encryption.mode).toBe("aes-256-gcm");
    expect(JSON.stringify(backup)).not.toContain("github-token");
    expect(decodeRuntimeDataBackup({ backup, backupKey: "backup-key" })).toEqual(snapshot);
    expect(() => decodeRuntimeDataBackup({ backup, backupKey: "wrong-key" })).toThrow();
  });
});
