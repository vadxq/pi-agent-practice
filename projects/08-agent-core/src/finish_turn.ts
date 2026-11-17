import type { AgentOptions } from "@earendil-works/pi-agent-core";

const stopAfterNormalTurn: NonNullable<AgentOptions["finishTurn"]> = (
  turn,
) => {
  // 失败与中止保持循环本身的退出语义。
  if (turn.message.stopReason === "error"
      || turn.message.stopReason === "aborted") {
    return undefined;
  }
  return { action: "end" };
};

export const options: Pick<AgentOptions, "finishTurn"> = {
  finishTurn: stopAfterNormalTurn,
};
