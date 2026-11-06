import type { Budget, HarnessEvent, HarnessTaskSpec } from "./types.js";

export class BudgetExceededError extends Error {
  constructor(message: string) { super(message); this.name = "BudgetExceededError"; }
}

export class TaskTimeoutError extends Error {
  constructor(message: string) { super(message); this.name = "TaskTimeoutError"; }
}

export interface RunControl {
  readonly signal: AbortSignal;
  readonly modelCalls: () => number;
  readonly toolCalls: () => number;
  readonly admitModel: () => void;
  readonly admitTool: () => void;
  readonly accountCost: (costUsd: number) => void;
  readonly emit: (agentId: string, type: HarnessEvent["type"], detail: string) => void;
  readonly close: () => void;
}

/** 唯一共享的可变状态只用于运行边界；每次派发都先同步预留次数。 */
export function createControl(spec: HarnessTaskSpec, options: {
  readonly signal: AbortSignal;
  readonly onEvent: (event: HarnessEvent) => void;
}): RunControl {
  const controller: AbortController = new AbortController();
  const budget: Budget = spec.budget;
  let modelCalls: number = 0;
  let toolCalls: number = 0;
  let reportedCostUsd: number = 0;
  const cancel: () => void = (): void => controller.abort(options.signal.reason);
  options.signal.addEventListener("abort", cancel, { once: true });
  if (options.signal.aborted) cancel();
  const timer: ReturnType<typeof setTimeout> = setTimeout((): void => {
    controller.abort(new TaskTimeoutError("根任务超过 timeoutMs"));
  }, budget.timeoutMs);
  const rejectBudget: (reason: string) => never = (reason: string): never => {
    const error: BudgetExceededError = new BudgetExceededError(reason);
    controller.abort(error);
    throw error;
  };
  return {
    signal: controller.signal,
    modelCalls: (): number => modelCalls,
    toolCalls: (): number => toolCalls,
    admitModel: (): void => {
      controller.signal.throwIfAborted();
      if (modelCalls >= budget.maxModelCalls) rejectBudget("根任务模型调用次数已用尽");
      modelCalls += 1;
    },
    admitTool: (): void => {
      controller.signal.throwIfAborted();
      if (toolCalls >= budget.maxToolCalls) rejectBudget("根任务工具调用次数已用尽");
      toolCalls += 1;
    },
    accountCost: (costUsd: number): void => {
      reportedCostUsd += costUsd;
      if (spec.costEstimateAvailable && reportedCostUsd >= budget.maxCostUsd) controller.abort(new BudgetExceededError("已报告费用达到预算"));
    },
    emit: (agentId: string, type: HarnessEvent["type"], detail: string): void => options.onEvent({
      taskId: spec.taskId, agentId, timestamp: new Date().toISOString(), type, detail,
    }),
    close: (): void => { clearTimeout(timer); options.signal.removeEventListener("abort", cancel); },
  };
}
