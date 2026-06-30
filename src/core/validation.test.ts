import type { ActionDefinition } from "./types.ts";

import { describe, expect, it } from "vitest";
import { validateActionInput } from "./validation.ts";

const action: ActionDefinition = {
  id: "hackernews.search_posts",
  service: "hackernews",
  name: "search_posts",
  description: "Search Hacker News posts.",
  requiredScopes: [],
  providerPermissions: [],
  inputSchema: {
    type: "object",
    properties: { message: { type: "string" } },
    required: ["message"],
    additionalProperties: false,
  },
  outputSchema: { type: "object" },
};

describe("validateActionInput", () => {
  it("accepts valid input", () => {
    expect(validateActionInput(action, { message: "hello" }).valid).toBe(true);
  });

  it("rejects invalid input", () => {
    expect(validateActionInput(action, {}).valid).toBe(false);
  });
});
