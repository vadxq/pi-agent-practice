import assert from "node:assert/strict";
import { access, mkdir } from "node:fs/promises";
import { ModelRuntime, SettingsManager } from "@earendil-works/pi-coding-agent";

// 不请求 provider；用真实模型目录核对路由所需的物理模型。
await access(new URL("../src/router.ts", import.meta.url));
await mkdir(".pi", { recursive: true });
const runtime: ModelRuntime = await ModelRuntime.create({
  authPath: ".pi/self-check-auth.json", modelsPath: null, modelsStorePath: ".pi/self-check-models.json",
  allowModelNetwork: false, refreshOnCreate: false,
});
assert.ok(runtime.getModel("anthropic", "claude-sonnet-4-6"));
assert.equal(runtime.getModel("course-missing", "missing"), undefined);
assert.ok(SettingsManager.inMemory({}).getRetrySettings());
console.log(JSON.stringify({ passed: true, check: "local-model-catalog", modelRequests: 0, routingRequests: "not_run" }));
