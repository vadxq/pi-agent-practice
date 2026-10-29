import type {
  AgentSettledEvent,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

const CHECKLIST: string = "审阅本次 diff；从本项目根目录执行 npm run lab:check；保留退出状态；不要自动 commit/push。";

export default function workflowReminder(pi: ExtensionAPI): void {
  pi.registerCommand("shipping-checklist", {
    description: "显示运费练习的人工审阅清单，不执行测试。",
    handler: async (_args: string, context: ExtensionCommandContext): Promise<void> => {
      if (!context.hasUI) {
        throw new Error("shipping-checklist requires interactive UI; no validation was executed.");
      }
      context.ui.notify(CHECKLIST, "info");
    },
  });
  // 只观察最终空闲事件，不发送新任务，防止通知触发新的运行循环。
  pi.on("agent_settled", (event: AgentSettledEvent, context: ExtensionContext): void => {
    if (context.hasUI) {
      context.ui.notify(event.aborted ? "本次运行已中止，请检查现场改动。" : CHECKLIST, "info");
    }
  });
}
