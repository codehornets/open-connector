import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AesGcmSecretCodec } from "./secret-codec.ts";
import { SqliteRuntimeDatabase } from "./sqlite-runtime-store.ts";

const tempDirs: string[] = [];
const githubProfile = {
  accountId: "github:octocat",
  displayName: "octocat",
  grantedScopes: [],
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("SqliteRuntimeDatabase", () => {
  it("persists local runtime state across database instances", async () => {
    const databasePath = await createDatabasePath();
    const first = new SqliteRuntimeDatabase(databasePath, { runLimit: 2 });

    await first.connectionStore.set("github", {
      authType: "api_key",
      apiKey: "github-token",
      values: { apiKey: "github-token" },
      profile: githubProfile,
      metadata: { login: "octocat" },
    });
    await first.oauthClientConfigStore.set({
      service: "gmail",
      clientId: "client-id",
      clientSecret: "client-secret",
      extra: { tenant: "default" },
    });
    await first.oauthStateStore.set({
      service: "gmail",
      state: "state-1",
      createdAt: "2026-06-30T00:00:00.000Z",
    });
    first.runLogStore.add({
      id: "run-1",
      actionId: "hackernews.get_top_stories",
      caller: "http",
      startedAt: "2026-06-30T00:00:00.000Z",
      completedAt: "2026-06-30T00:00:01.000Z",
      durationMs: 1000,
      ok: true,
    });
    first.close();

    const second = new SqliteRuntimeDatabase(databasePath, { runLimit: 2 });
    await expect(second.connectionStore.get("github")).resolves.toMatchObject({
      authType: "api_key",
      apiKey: "github-token",
      metadata: { login: "octocat" },
    });
    await expect(second.oauthClientConfigStore.get("gmail")).resolves.toMatchObject({
      clientId: "client-id",
      clientSecret: "client-secret",
      extra: { tenant: "default" },
    });
    await expect(second.oauthStateStore.take("state-1")).resolves.toMatchObject({
      service: "gmail",
      state: "state-1",
    });
    await expect(second.oauthStateStore.take("state-1")).resolves.toBeUndefined();
    expect(second.runLogStore.list()).toEqual([
      {
        id: "run-1",
        actionId: "hackernews.get_top_stories",
        caller: "http",
        startedAt: "2026-06-30T00:00:00.000Z",
        completedAt: "2026-06-30T00:00:01.000Z",
        durationMs: 1000,
        ok: true,
      },
    ]);
    second.close();
  });

  it("keeps only the configured number of recent runs", async () => {
    const databasePath = await createDatabasePath();
    const database = new SqliteRuntimeDatabase(databasePath, { runLimit: 2 });

    database.runLogStore.add(createRun("run-1", "2026-06-30T00:00:00.000Z"));
    database.runLogStore.add(createRun("run-2", "2026-06-30T00:00:01.000Z"));
    database.runLogStore.add(createRun("run-3", "2026-06-30T00:00:02.000Z"));

    expect(database.runLogStore.list().map((run) => run.id)).toEqual(["run-3", "run-2"]);
    database.close();
  });

  it("encrypts stored credentials when a secret codec is configured", async () => {
    const databasePath = await createDatabasePath();
    const first = new SqliteRuntimeDatabase(databasePath, {
      secretCodec: new AesGcmSecretCodec("local-test-key"),
    });

    await first.connectionStore.set("github", {
      authType: "api_key",
      apiKey: "github-token",
      values: { apiKey: "github-token" },
      profile: githubProfile,
      metadata: {},
    });
    first.close();

    await expectDatabaseDirectoryNotToContain(databasePath, "github-token");

    const second = new SqliteRuntimeDatabase(databasePath, {
      secretCodec: new AesGcmSecretCodec("local-test-key"),
    });
    await expect(second.connectionStore.get("github")).resolves.toMatchObject({
      authType: "api_key",
      apiKey: "github-token",
    });
    second.close();
  });

  it("exports, restores, and resets runtime data snapshots", async () => {
    const sourcePath = await createDatabasePath();
    const source = new SqliteRuntimeDatabase(sourcePath);
    await source.connectionStore.set("github", {
      authType: "api_key",
      apiKey: "github-token",
      values: { apiKey: "github-token" },
      profile: githubProfile,
      metadata: {},
    });
    source.runLogStore.add(createRun("run-1", "2026-06-30T00:00:00.000Z"));
    const snapshot = await source.exportSnapshot();
    source.resetRuntimeData();
    await expect(source.connectionStore.get("github")).resolves.toBeUndefined();
    expect(source.runLogStore.list()).toEqual([]);
    source.close();

    const targetPath = await createDatabasePath();
    const target = new SqliteRuntimeDatabase(targetPath);
    target.restoreSnapshot(snapshot);
    await expect(target.connectionStore.get("github")).resolves.toMatchObject({
      authType: "api_key",
      apiKey: "github-token",
    });
    expect(target.runLogStore.list().map((run) => run.id)).toEqual(["run-1"]);
    target.close();
  });

  it("supports re-encrypting runtime data with a new codec", async () => {
    const databasePath = await createDatabasePath();
    const oldDatabase = new SqliteRuntimeDatabase(databasePath, {
      secretCodec: new AesGcmSecretCodec("old-key"),
    });
    await oldDatabase.connectionStore.set("github", {
      authType: "api_key",
      apiKey: "github-token",
      values: { apiKey: "github-token" },
      profile: githubProfile,
      metadata: {},
    });
    const snapshot = await oldDatabase.exportSnapshot();
    oldDatabase.close();

    const newDatabase = new SqliteRuntimeDatabase(databasePath, {
      secretCodec: new AesGcmSecretCodec("new-key"),
    });
    newDatabase.restoreSnapshot(snapshot);
    newDatabase.close();

    const withOldKey = new SqliteRuntimeDatabase(databasePath, {
      secretCodec: new AesGcmSecretCodec("old-key"),
    });
    await expect(withOldKey.connectionStore.get("github")).rejects.toThrow();
    withOldKey.close();

    const withNewKey = new SqliteRuntimeDatabase(databasePath, {
      secretCodec: new AesGcmSecretCodec("new-key"),
    });
    await expect(withNewKey.connectionStore.get("github")).resolves.toMatchObject({
      authType: "api_key",
      apiKey: "github-token",
    });
    withNewKey.close();
  });
});

async function createDatabasePath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "oomol-connect-"));
  tempDirs.push(dir);
  return join(dir, "connect.sqlite");
}

function createRun(id: string, startedAt: string) {
  return {
    id,
    actionId: "hackernews.get_top_stories",
    caller: "http" as const,
    startedAt,
    completedAt: startedAt,
    durationMs: 0,
    ok: true,
  };
}

async function expectDatabaseDirectoryNotToContain(databasePath: string, needle: string): Promise<void> {
  const dir = dirname(databasePath);
  const entries = await readdir(dir);
  for (const entry of entries) {
    const bytes = await readFile(join(dir, entry), "utf8");
    expect(bytes).not.toContain(needle);
  }
}
