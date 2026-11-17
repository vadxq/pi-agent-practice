import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import { createRegistry, Harness } from "@earendil-works/pi-durable";
import type { ConversationId } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";

await mkdir(".pi", { recursive: true });
const models: ReturnType<typeof createModels> = createModels();
const context: typeof BACKGROUND_CONTEXT = BACKGROUND_CONTEXT;

async function rootId(): Promise<ConversationId> {
  const storage: Awaited<ReturnType<typeof openNodeSqliteStorage>> = await openNodeSqliteStorage(".pi/self-check.sqlite");
  const harness: Harness = await Harness.open(storage, { models, registry: createRegistry() }, context);
  try {
    const root: Awaited<ReturnType<typeof harness.root>> = await harness.root(context, { agent: { model: { provider: "openai", modelId: "local-check-no-request" } } });
    return root.id;
  } finally {
    await harness.close(context);
  }
}

const first: ConversationId = await rootId();
const second: ConversationId = await rootId();
assert.equal(first, second);
console.log(JSON.stringify({ passed: true, check: "sqlite-close-and-reopen", modelRequests: 0, rootId: second }));
