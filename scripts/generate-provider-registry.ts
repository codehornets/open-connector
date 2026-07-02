import type { ProviderDefinition } from "../src/core/types.ts";

import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const providersDir = join(process.cwd(), "src/providers");
const entries = await readdir(providersDir, { withFileTypes: true });
const services = entries
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b));
const executableActionIds = new Map<string, string[]>(
  await Promise.all(
    services.map(async (service): Promise<[string, string[]]> => {
      const module = (await import(`../src/providers/${service}/definition.ts`)) as ProviderDefinitionModule;
      return [service, module.provider.actions.map((action) => action.id).sort((a, b) => a.localeCompare(b))];
    }),
  ),
);

interface ProviderDefinitionModule {
  provider: ProviderDefinition;
}

function propertyName(service: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(service) ? service : JSON.stringify(service);
}

const lines = [
  'import type { CredentialValidators, ProviderExecutors } from "../core/types.ts";',
  "",
  "/** Lazy-loaded provider executor module shape. */",
  "export type ExecutorModule = {",
  "  credentialValidators?: CredentialValidators;",
  "  executors: ProviderExecutors;",
  "};",
  "",
  "/** Generated lazy imports for provider executors. Do not hand-edit. */",
  "export const executorModules: Record<string, () => Promise<ExecutorModule>> = {",
  ...services.map(
    (service) => `  ${propertyName(service)}: (): Promise<ExecutorModule> => import("./${service}/executors.ts"),`,
  ),
  "};",
  "",
  "/** Generated local executable action ids by provider. Do not hand-edit. */",
  "export const executableActionIds: Record<string, string[]> = {",
  ...services.flatMap((service) => [
    `  ${propertyName(service)}: [`,
    ...(executableActionIds.get(service) ?? []).map((actionId) => `    ${JSON.stringify(actionId)},`),
    "  ],",
  ]),
  "};",
];

const registryPath = join(providersDir, "registry.generated.ts");
const registryContent = `${lines.join("\n")}\n`;
const existingContent = await readTextFile(registryPath);
if (existingContent !== registryContent) {
  await writeFile(registryPath, registryContent);
  console.log(`Generated provider registry for ${services.length} providers.`);
} else {
  console.log(`Provider registry is up to date for ${services.length} providers.`);
}

async function readTextFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}
