import assert from "node:assert/strict";
import test from "node:test";
import { decideStatus, emptyUsage, parseAgentAnswer, sumUsage } from "./contracts.js";
import { BudgetExceededError, createControl } from "./control.js";
import type { AgentAnswer, AgentResult, HarnessTaskSpec, ValidationResult } from "./types.js";

const answer: AgentAnswer = { summary: "检查阈值", evidence: [{ path: "src/shipping.ts", line: 1, reason: "存在边界条件" }], unknowns: [], verdict: "acceptable" };
const reviewer: AgentResult = { agentId: "reviewer", parentTaskId: "test", role: "reviewer", status: "completed", sessionId: "local", sessionFile: null, answer, error: null, durationMs: 1, usage: emptyUsage() };
const validation: ValidationResult = { name: "shipping", status: "passed", command: "fixed-check", exitCode: 0, output: "passed" };
const spec: HarnessTaskSpec = { taskId: "test", workspace: "/workspace", artifactRoot: ".pi/runs", provider: "anthropic", model: "claude-sonnet-4-6", modelsPath: null, costEstimateAvailable: false, goal: "分析", mode: "single", scoutConcurrency: 2, retryTransient: false, allowWrite: false, budget: { timeoutMs: 10_000, maxModelCalls: 1, maxToolCalls: 1, maxCostUsd: 1 } };

test("严格结果契约拒绝路径越界、空证据与模型自说的成功", (): void => {
  assert.deepEqual(parseAgentAnswer(JSON.stringify(answer)), answer);
  assert.throws((): AgentAnswer => parseAgentAnswer(JSON.stringify({ ...answer, evidence: [] })), TypeError);
  assert.throws((): AgentAnswer => parseAgentAnswer(JSON.stringify({ ...answer, evidence: [{ path: "../secret", line: 1, reason: "x" }] })), TypeError);
  assert.throws((): AgentAnswer => parseAgentAnswer(JSON.stringify({ ...answer, verdict: "passed" })), TypeError);
});

test("写模式必须同时有验证通过与独立审查通过", (): void => {
  assert.equal(decideStatus({ allowWrite: false, agents: [reviewer], validations: [] }), "analysis_complete");
  assert.equal(decideStatus({ allowWrite: true, agents: [reviewer], validations: [] }), "failed");
  assert.equal(decideStatus({ allowWrite: true, agents: [reviewer], validations: [validation] }), "ready_for_review");
  assert.equal(decideStatus({ allowWrite: true, agents: [{ ...reviewer, status: "failed" }], validations: [validation] }), "failed");
  assert.equal(decideStatus({ allowWrite: true, agents: [{ ...reviewer, answer: { ...answer, verdict: "inconclusive" } }], validations: [validation] }), "failed");
});

test("用量汇总是纯转换，不修改原对象", (): void => {
  const usage = Object.freeze({ ...emptyUsage(), inputTokens: 10, reportedCostUsd: 0.1 });
  assert.equal(sumUsage([usage, usage]).inputTokens, 20);
  assert.equal(sumUsage([usage, usage]).reportedCostUsd, 0.2);
  assert.equal(usage.inputTokens, 10);
});

test("根任务同步预留预算，超限取消所有子运行", (): void => {
  const control = createControl(spec, { signal: new AbortController().signal, onEvent: (): void => {} });
  try {
    control.admitModel();
    assert.throws((): void => control.admitModel(), BudgetExceededError);
    assert.equal(control.modelCalls(), 1);
    assert.equal(control.signal.aborted, true);
  } finally { control.close(); }
});
