import assert from "node:assert/strict";
import { Agent } from "@earendil-works/pi-agent-core";
import { createModels } from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";

const models: ReturnType<typeof createModels> = createModels();
models.setProvider(anthropicProvider());
const model: ReturnType<typeof models.getModel> = models.getModel("anthropic", "claude-sonnet-4-6");
assert.ok(model);
const agent: Agent = new Agent({ initialState: { systemPrompt: "本地装配检查", model, tools: [] }, streamFn: models.streamSimple.bind(models), toolExecution: "sequential" });
assert.deepEqual(agent.state.tools, []);
await agent.waitForIdle();
console.log(JSON.stringify({ passed: true, check: "agent-construction-and-idle", modelRequests: 0 }));
