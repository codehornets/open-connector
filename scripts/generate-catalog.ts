import type { ProviderDefinition } from "../src/core/types.ts";

import { mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sortProviders } from "../src/core/catalog.ts";

const outputDir = join(process.cwd(), "catalog/apps");
const catalogRootDir = join(process.cwd(), "catalog");
const tempOutputDir = join(catalogRootDir, `.apps-${process.pid}-${Date.now()}`);
const providers = await loadProviderDefinitions();
const apps = sortProviders(providers);

await mkdir(catalogRootDir, { recursive: true });

try {
  await mkdir(tempOutputDir, { recursive: true });
  for (const app of apps) {
    await writeFile(join(tempOutputDir, `${app.service}.json`), `${JSON.stringify(app, null, 2)}\n`);
  }
  await rm(outputDir, { recursive: true, force: true });
  await rename(tempOutputDir, outputDir);
} catch (error) {
  await rm(tempOutputDir, { recursive: true, force: true });
  throw error;
}

console.log(`Generated ${apps.length} apps and ${apps.reduce((sum, app) => sum + app.actions.length, 0)} actions.`);

async function loadProviderDefinitions(): Promise<ProviderDefinition[]> {
  const providersDir = join(process.cwd(), "src/providers");
  const entries = await readdir(providersDir, { withFileTypes: true });
  const services = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  return Promise.all(
    services.map(async (service): Promise<ProviderDefinition> => {
      const module = (await import(`../src/providers/${service}/definition.ts`)) as ProviderDefinitionModule;
      return module.provider;
    }),
  );
}

interface ProviderDefinitionModule {
  provider: ProviderDefinition;
}
