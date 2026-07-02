---
name: add-provider
description: Add a new provider to the OOMOL Connect open source connector. Use when implementing a provider definition, catalog entry, local executor, generated registry update, or examples for src/providers/<service>.
---

# Add Provider

Use this workflow to add or update a provider in this repository.

## Architecture

Provider code lives under:

```text
src/providers/<service>/
  definition.ts
  executors.ts
```

The runtime is intentionally lazy:

- `definition.ts` is used to generate `catalog/apps/<service>.json`.
- The server reads generated catalog JSON at startup.
- `executors.ts` is imported only when an action for that provider is executed.
- `src/providers/registry.generated.ts` is generated; do not hand-edit it.

## Naming

Use a stable lowercase service id, usually the product slug:

- Good: `gmail`, `github`, `google_sheets`, `airtable`
- Avoid display names, spaces, uppercase, and vendor marketing names that may change.

Action ids must be globally stable:

```text
<service>.<verbOrOperation>
```

Examples:

```text
github.createIssue
gmail.sendEmail
airtable.createRecord
```

## Required Files

Create `src/providers/<service>/definition.ts`:

```ts
import type { ProviderDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "<service>";

export const provider: ProviderDefinition = {
  service,
  displayName: "<Display Name>",
  categories: ["Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API key",
      placeholder: "provider_api_key",
      extraFields: [],
    },
  ],
  homepageUrl: "https://example.com",
  actions: [
    defineProviderAction(service, {
      name: "Example Action",
      description: "Does one concrete thing.",
      requiredScopes: [],
      inputSchema: s.object({}),
      outputSchema: s.object({}),
    }),
  ],
};
```

Create `src/providers/<service>/executors.ts`.

Do not add catalog-only provider placeholders. Add the provider when it has a runnable local executor.

For runnable providers:

```ts
import type { ProviderExecutors } from "../../core/types.ts";

import { defineApiKeyProviderExecutors } from "../provider-runtime.ts";

const exampleActionHandlers: Record<
  string,
  (input: Record<string, unknown>, context: { apiKey: string; fetcher: typeof fetch }) => Promise<unknown>
> = {
  async exampleAction(_input, context): Promise<unknown> {
    return {};
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("<service>", exampleActionHandlers);
```

## Workflow

1. Add or edit files under `src/providers/<service>`.
2. Generate the registry and catalog:

```bash
npm run generate:catalog
```

3. Run project checks:

```bash
npm run fix-check
```

4. Run a local smoke test if an executor exists:

```bash
npm run dev
curl -s 'http://localhost:3000/api/actions/<service>.<actionName>/runs' \
  -H 'content-type: application/json' \
  -d '{"input":{}}'
```

## Executor Rules

- Validate input through the action schema; do not reimplement schema validation in executors unless provider-specific normalization is needed.
- Read the resolved credential through `context.getCredential(service)`.
- Return structured errors with stable `code` strings.
- Do not import executors from `definition.ts`.
- Do not use barrel files such as `index.ts`; import from the concrete module that owns the API.
- Keep provider SDK clients or HTTP helpers inside the provider folder unless shared by multiple providers.
- Put generic query/body assembly in `src/core/request.ts`, generic value reads/casts in `src/core/cast.ts`, and common credential executor wiring in `src/providers/provider-runtime.ts`.
- For unavailable local execution, keep the action in `definition.ts` and omit the executor entry.

## Catalog Rules

- Do not hand-edit `catalog/apps/*.json`.
- Do not hand-edit `src/providers/registry.generated.ts`.
- `definition.ts` must not depend on network calls or credentials.
- Keep schemas JSON-serializable.
- Prefer `jsonSchema` helpers from `src/core/json-schema.ts` for common schema shapes, including `s.actionInput`, `s.actionOutput`, `s.nonEmptyString`, and `s.stringArray` when they fit.
- Avoid provider-local schema helpers that only wrap shared behavior. Keep provider-local helpers for provider concepts, not generic object/input/string boilerplate.
- Use `as const` only when it is needed to derive a literal union or tuple type that materially improves correctness. Runtime validation and JSON Schema should carry action input correctness.

## Maintenance Checks

Use these commands before finishing provider work:

```bash
npm run fix-check
npm run generate:catalog
```

`npm run fix-check` runs lint fixes, formatting fixes, and the `src` typecheck. Run `npm run build`
separately only when you need a no-fix typecheck for CI parity.
