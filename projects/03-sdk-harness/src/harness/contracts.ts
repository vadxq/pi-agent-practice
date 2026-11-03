import path from "node:path";
import type { AgentAnswer, AgentResult, Evidence, HarnessTaskSpec, TaskReport, TaskStatus, UsageReport, ValidationResult } from "./types.js";

const MAX_ANSWER_CHARS: number = 24_000;
const MAX_EVIDENCE_ITEMS: number = 24;
const MAX_UNKNOWN_ITEMS: number = 12;
const TRANSIENT_MAX_RETRIES: number = 5;
const TRANSIENT_BASE_DELAY_MS: number = 1_000;
const TRANSIENT_MAX_DELAY_MS: number = 10_000;

/** 只选择 Pi 内建重试参数，不改写错误分类或创建新的重试循环。 */
export function retryPolicy(enabled: boolean): TaskReport["retryPolicy"] {
  return { enabled, maxRetries: TRANSIENT_MAX_RETRIES, baseDelayMs: TRANSIENT_BASE_DELAY_MS, maxAgentDelayMs: TRANSIENT_MAX_DELAY_MS, providerMaxRetries: 0 };
}

export function emptyUsage(): UsageReport {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reportedCostUsd: 0 };
}

/** 纯函数汇总已报告用量；未结算的请求不能被估算成已经免费。 */
export function sumUsage(items: readonly UsageReport[]): UsageReport {
  return items.reduce<UsageReport>((sum: UsageReport, item: UsageReport): UsageReport => ({
    inputTokens: sum.inputTokens + item.inputTokens,
    outputTokens: sum.outputTokens + item.outputTokens,
    cacheReadTokens: sum.cacheReadTokens + item.cacheReadTokens,
    cacheWriteTokens: sum.cacheWriteTokens + item.cacheWriteTokens,
    reportedCostUsd: sum.reportedCostUsd + item.reportedCostUsd,
  }), emptyUsage());
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Agent 结果必须是 JSON object");
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`Agent 结果字段 ${name} 必须是非空字符串`);
  }
  return value.trim();
}

function evidence(value: unknown): Evidence {
  const entry: Record<string, unknown> = record(value);
  const file: string = text(entry.path, "evidence.path");
  const line: unknown = entry.line;
  if (path.isAbsolute(file) || file.split(/[\\/]/u).includes("..")) {
    throw new TypeError("evidence.path 必须是工作区内的相对路径");
  }
  if (typeof line !== "number" || !Number.isSafeInteger(line) || line < 1) {
    throw new TypeError("evidence.line 必须是从 1 开始的整数");
  }
  return { path: file, line, reason: text(entry.reason, "evidence.reason") };
}

/** JSON 通过不代表结论正确；调用者还要核对实际文件和业务验收。 */
export function parseAgentAnswer(raw: string): AgentAnswer {
  if (raw.length > MAX_ANSWER_CHARS) throw new RangeError("Agent 结果超过大小限制");
  const input: unknown = JSON.parse(raw);
  const answer: Record<string, unknown> = record(input);
  if (!Array.isArray(answer.evidence) || answer.evidence.length === 0 || answer.evidence.length > MAX_EVIDENCE_ITEMS) {
    throw new TypeError("Agent 结果必须有 1–24 条 evidence");
  }
  if (!Array.isArray(answer.unknowns) || answer.unknowns.length > MAX_UNKNOWN_ITEMS) {
    throw new TypeError("unknowns 必须是最多 12 项的数组");
  }
  const verdict: unknown = answer.verdict;
  if (verdict !== "acceptable" && verdict !== "changes_required" && verdict !== "inconclusive") {
    throw new TypeError("verdict 必须是 acceptable、changes_required 或 inconclusive");
  }
  return {
    summary: text(answer.summary, "summary"),
    evidence: answer.evidence.map((item: unknown): Evidence => evidence(item)),
    unknowns: answer.unknowns.map((item: unknown): string => text(item, "unknowns")),
    verdict,
  };
}

export function validateSpec(spec: HarnessTaskSpec): void {
  if (!/^[A-Za-z0-9_-]{1,80}$/u.test(spec.taskId)) throw new TypeError("taskId 格式无效");
  for (const value of [spec.workspace, spec.artifactRoot, spec.provider, spec.model, spec.goal]) {
    if (value.trim().length === 0) throw new TypeError("工作区、产物目录、provider、model 和 goal 必须显式提供");
  }
  for (const value of [spec.budget.timeoutMs, spec.budget.maxModelCalls, spec.budget.maxToolCalls]) {
    if (!Number.isSafeInteger(value) || value < 1) throw new RangeError("时间和调用预算必须为正整数");
  }
  if (!Number.isFinite(spec.budget.maxCostUsd) || spec.budget.maxCostUsd <= 0) throw new RangeError("费用预算必须大于零");
  if (spec.scoutConcurrency !== 1 && spec.scoutConcurrency !== 2) throw new RangeError("scoutConcurrency 必须为 1 或 2");
  if (typeof spec.retryTransient !== "boolean") throw new TypeError("retryTransient 必须显式为 boolean");
  if (spec.allowWrite && spec.mode !== "team") throw new TypeError("课程写模式必须使用 team，以执行独立 reviewer");
}

export function decideStatus(input: {
  readonly allowWrite: boolean;
  readonly agents: readonly AgentResult[];
  readonly validations: readonly ValidationResult[];
}): TaskStatus {
  if (input.agents.length === 0 || input.agents.some((agent: AgentResult): boolean => agent.status !== "completed")) return "failed";
  if (!input.allowWrite) return "analysis_complete";
  const reviewer: AgentResult | undefined = input.agents.find((agent: AgentResult): boolean => agent.role === "reviewer");
  const passed: boolean = input.validations.length > 0 && input.validations.every((item: ValidationResult): boolean => item.status === "passed");
  return passed && reviewer?.answer?.verdict === "acceptable" ? "ready_for_review" : "failed";
}

export function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
