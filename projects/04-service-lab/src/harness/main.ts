import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { describeError } from "./contracts.js";
import { runHarness } from "./index.js";
import { createExplicitSession } from "./sdk.js";
import type { HarnessEvent, HarnessTaskSpec, TaskReport } from "./types.js";
import { verifyShippingWorkspace } from "./validation.js";

const { values } = parseArgs({
  options: {
    workspace: { type: "string" }, provider: { type: "string" }, model: { type: "string" }, models: { type: "string" },
    goal: { type: "string" }, mode: { type: "string" }, "allow-write": { type: "boolean" }, "self-check": { type: "boolean" }, "cost-metadata-known": { type: "boolean" }, "retry-transient": { type: "boolean" },
    "timeout-ms": { type: "string" }, "max-model-calls": { type: "string" }, "max-tool-calls": { type: "string" }, "max-cost-usd": { type: "string" },
    "scout-concurrency": { type: "string" },
  }, strict: true,
});

function required(value: string | undefined, name: string): string {
  if (value === undefined || value.trim() === "") throw new TypeError(`缺少 --${name}`);
  return value;
}

function numberOption(value: string | undefined, fallback: number): number {
  return value === undefined ? fallback : Number(value);
}

function taskSpec(selfCheck: boolean): HarnessTaskSpec {
  const mode: string = values.mode ?? "single";
  if (mode !== "single" && mode !== "team") throw new TypeError("--mode 必须为 single 或 team");
  const scoutConcurrency: number = numberOption(values["scout-concurrency"], 2);
  if (scoutConcurrency !== 1 && scoutConcurrency !== 2) throw new RangeError("--scout-concurrency 必须为 1 或 2");
  return {
    taskId: randomUUID(), workspace: path.resolve(selfCheck ? "." : required(values.workspace, "workspace")),
    artifactRoot: path.resolve(".pi", "runs"),
    provider: selfCheck ? "anthropic" : required(values.provider, "provider"),
    model: selfCheck ? "claude-sonnet-4-6" : required(values.model, "model"),
    modelsPath: values.models === undefined ? null : path.resolve(values.models),
    costEstimateAvailable: values["cost-metadata-known"] === true,
    goal: selfCheck ? "只创建和释放 SDK session，不调用模型" : required(values.goal, "goal"),
    mode, scoutConcurrency, retryTransient: values["retry-transient"] === true, allowWrite: values["allow-write"] === true,
    budget: {
      timeoutMs: numberOption(values["timeout-ms"], 120_000), maxModelCalls: numberOption(values["max-model-calls"], 16),
      maxToolCalls: numberOption(values["max-tool-calls"], 40), maxCostUsd: numberOption(values["max-cost-usd"], 1),
    },
  };
}

async function selfCheck(spec: HarnessTaskSpec): Promise<void> {
  const directory: string = path.join(spec.artifactRoot, `self-check-${spec.taskId}`);
  await mkdir(path.join(directory, "runtime"), { recursive: true });
  const runtime: ModelRuntime = await ModelRuntime.create({
    authPath: path.join(directory, "runtime", "auth.json"), modelsPath: null,
    modelsStorePath: path.join(directory, "runtime", "models-cache.json"), allowModelNetwork: false, refreshOnCreate: false,
  });
  const session = await createExplicitSession({ spec, directory, runtime, role: "scout-code" });
  try {
    const active: string[] = session.getActiveToolNames();
    if (active.join(",") !== "read,grep,find,ls") throw new Error(`工具集合不符：${active.join(",")}`);
    console.log(JSON.stringify({ check: "real-sdk-lifecycle", passed: true, modelRequests: 0, tools: active, sessionId: session.sessionManager.getSessionId(), retry: session.settingsManager.getRetrySettings() }));
  } finally { await session.abort(); session.dispose(); }
}

async function main(): Promise<void> {
  const spec: HarnessTaskSpec = taskSpec(values["self-check"] === true);
  if (values["self-check"] === true) { await selfCheck(spec); return; }
  const controller: AbortController = new AbortController();
  const cancel: () => void = (): void => controller.abort(new Error("收到 SIGINT/SIGTERM，取消根任务"));
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  try {
    const report: TaskReport = await runHarness(spec, {
      signal: controller.signal, verifyWorkspace: verifyShippingWorkspace,
      onEvent: (event: HarnessEvent): void => { process.stderr.write(`${JSON.stringify(event)}\n`); },
    });
    console.log(JSON.stringify(report, null, 2));
    if (report.status !== "ready_for_review" && report.status !== "analysis_complete") process.exitCode = 1;
  } finally {
    process.removeListener("SIGINT", cancel); process.removeListener("SIGTERM", cancel);
  }
}

main().catch((error: unknown): void => {
  process.stderr.write(`${JSON.stringify({ level: "error", error: describeError(error) })}\n`);
  process.exitCode = 1;
});
