import type { CredentialProfile } from "../core/types.ts";

export type RunLogCaller = "http" | "mcp" | "web";

/**
 * One recent action run shown by the local runtime.
 */
export type RunLog = {
  id: string;
  actionId: string;
  caller: RunLogCaller;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  ok: boolean;
  connectionProfile?: CredentialProfile;
  inputSummary?: unknown;
  errorCode?: string;
  errorMessage?: string;
};

/**
 * Storage contract for recent action run logs.
 */
export interface IRunLogStore {
  add(run: RunLog): void;
  list(): RunLog[];
}
