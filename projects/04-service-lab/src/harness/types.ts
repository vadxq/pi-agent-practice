/** 这些是课程宿主的业务契约，不是 Pi SDK 自带的任务类型。 */
export type AgentRole = "root" | "scout-code" | "scout-tests" | "reviewer";
export type AgentStatus = "completed" | "failed" | "cancelled";
export type TaskStatus = "analysis_complete" | "ready_for_review" | "failed" | "cancelled" | "budget_exceeded" | "interrupted";

export interface Budget {
  readonly timeoutMs: number;
  readonly maxModelCalls: number;
  readonly maxToolCalls: number;
  readonly maxCostUsd: number;
}

export interface HarnessTaskSpec {
  readonly taskId: string;
  readonly workspace: string;
  readonly artifactRoot: string;
  readonly provider: string;
  readonly model: string;
  readonly modelsPath: string | null;
  readonly costEstimateAvailable: boolean;
  readonly goal: string;
  readonly mode: "single" | "team";
  readonly scoutConcurrency: 1 | 2;
  readonly retryTransient: boolean;
  readonly allowWrite: boolean;
  readonly budget: Budget;
}

export interface Evidence {
  readonly path: string;
  readonly line: number;
  readonly reason: string;
}

export interface AgentAnswer {
  readonly summary: string;
  readonly evidence: readonly Evidence[];
  readonly unknowns: readonly string[];
  readonly verdict: "acceptable" | "changes_required" | "inconclusive";
}

export interface UsageReport {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly reportedCostUsd: number;
}

export interface AgentResult {
  readonly agentId: string;
  readonly parentTaskId: string;
  readonly role: AgentRole;
  readonly status: AgentStatus;
  readonly sessionId: string | null;
  readonly sessionFile: string | null;
  readonly answer: AgentAnswer | null;
  readonly error: string | null;
  readonly durationMs: number;
  readonly usage: UsageReport;
}

export interface ValidationResult {
  readonly name: string;
  readonly status: "passed" | "failed" | "not_run" | "cancelled";
  readonly command: string;
  readonly exitCode: number | null;
  readonly output: string;
}

export interface HarnessEvent {
  readonly taskId: string;
  readonly agentId: string;
  readonly timestamp: string;
  readonly type: "task_started" | "agent_started" | "model_request" | "tool_admitted" | "retry_scheduled" | "retry_finished" | "agent_settled" | "agent_finished" | "validation_finished" | "task_finished";
  readonly detail: string;
}

export interface HarnessOptions {
  readonly signal: AbortSignal;
  readonly onEvent: (event: HarnessEvent) => void;
  readonly verifyWorkspace: (workspace: string, signal: AbortSignal) => Promise<ValidationResult>;
}

export interface TaskReport {
  readonly schemaVersion: 1;
  readonly taskId: string;
  readonly status: TaskStatus;
  readonly goal: string;
  readonly workspace: string;
  readonly provider: string;
  readonly model: string;
  readonly allowWrite: boolean;
  readonly retryPolicy: {
    readonly enabled: boolean;
    readonly maxRetries: number;
    readonly baseDelayMs: number;
    readonly maxAgentDelayMs: number;
    readonly providerMaxRetries: number;
  };
  readonly startedAt: string;
  readonly durationMs: number;
  readonly agents: readonly AgentResult[];
  readonly validations: readonly ValidationResult[];
  readonly usage: UsageReport;
  readonly costEstimateAvailable: boolean;
  readonly estimatedCostUsd: number | null;
  readonly modelCalls: number;
  readonly toolCalls: number;
  readonly terminationReason: string | null;
  readonly artifacts: {
    readonly directory: string;
    readonly baselineDiff: string;
    readonly finalDiff: string;
    readonly report: string;
    readonly events: string;
  };
  readonly limitations: readonly string[];
}
