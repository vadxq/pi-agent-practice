import { Agent, type AgentEvent } from "@earendil-works/pi-agent-core";
import { createModels } from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";

const modelId: string | undefined = process.env.COURSE_CORE_MODEL;
if (!modelId) throw new Error("Missing COURSE_CORE_MODEL");

const models = createModels();
models.setProvider(anthropicProvider());
const model = models.getModel("anthropic", modelId);
if (!model) throw new Error("Unknown Anthropic model: " + modelId);

const agent: Agent = new Agent({
  initialState: {
    systemPrompt: "解释运费规则。没有工具执行证据时，不声称修改或测试通过。",
    model,
    tools: [],
  },
  streamFn: models.streamSimple.bind(models),
  toolExecution: "sequential",
});

const unsubscribe: () => void = agent.subscribe((event: AgentEvent): void => {
  if (event.type === "message_update"
      && event.assistantMessageEvent.type === "text_delta") {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});
const timeoutMs: number = 30_000;
const timer: ReturnType<typeof setTimeout> = setTimeout((): void => {
  agent.abort();
}, timeoutMs);

try {
  await agent.prompt("国内订单满5000分免基础运费，否则收500分；加急另加800分。国内订单5000分且加急，应收多少运费？");
  await agent.waitForIdle();
  const failed: boolean = agent.state.messages.some((message): boolean =>
    message.role === "assistant"
    && (message.stopReason === "error" || message.stopReason === "aborted")
  );
  if (failed) throw new Error("Agent response failed or was aborted");
  process.stdout.write("\n");
} finally {
  clearTimeout(timer);
  unsubscribe();
}
