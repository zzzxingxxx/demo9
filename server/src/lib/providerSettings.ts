import type { Db } from "./db/index.js";
import { getSettingsMap, setSetting } from "./appSettings.js";

export const providerFields = {
  xaiApiKey: "XAI_API_KEY",
  embeddingBaseUrl: "EMBEDDING_BASE_URL",
  embeddingModel: "EMBEDDING_MODEL",
  embeddingApiKey: "EMBEDDING_API_KEY"
} as const;
export async function loadProviderSettings(db: Db) {
  const settings = await getSettingsMap(db);
  for (const [field, env] of Object.entries(providerFields))
    if (settings[`provider.${field}`] !== undefined)
      process.env[env] = settings[`provider.${field}`];
}
export async function saveProviderSettings(
  db: Db,
  values: Partial<Record<keyof typeof providerFields, string>>
) {
  for (const [field, value] of Object.entries(values))
    if (value !== undefined) {
      await setSetting(db, `provider.${field}`, value.trim());
      process.env[providerFields[field as keyof typeof providerFields]] =
        value.trim();
    }
}
export function publicSettings(settings: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(settings).filter(([key]) => !key.startsWith("provider."))
  );
}
