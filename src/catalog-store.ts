import type { ActionDefinition, ProviderDefinition } from "./core/types.ts";

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { sortProviders } from "./core/catalog.ts";

/**
 * In-memory view of generated catalog JSON.
 *
 * `actionsById` is built at load time so request handlers do not repeatedly
 * scan every provider.
 */
export type CatalogStore = {
  providers: ProviderDefinition[];
  actions: ActionDefinition[];
  actionsById: Map<string, ActionDefinition>;
};

/**
 * Load generated provider catalog files from disk.
 */
export async function loadCatalog(
  catalogDir: string = join(process.cwd(), "catalog/apps"),
): Promise<CatalogStore> {
  const entries = await readdir(catalogDir, { withFileTypes: true });
  const providers = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map(async (entry) => {
        const content = await readFile(join(catalogDir, entry.name), "utf8");
        return JSON.parse(content) as ProviderDefinition;
      }),
  );
  const sortedProviders = sortProviders(providers);
  const actions = sortedProviders.flatMap((provider) => provider.actions);

  return {
    providers: sortedProviders,
    actions,
    actionsById: new Map(actions.map((action) => [action.id, action])),
  };
}
