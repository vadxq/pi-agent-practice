import { mkdir } from "node:fs/promises";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { AssistantEntry, createRegistry, Harness } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";

const modelId: string | undefined = process.env.COURSE_DURABLE_MODEL;
if (!modelId) throw new Error("Missing COURSE_DURABLE_MODEL");
const context = BACKGROUND_CONTEXT;
const models = createModels();
models.setProvider(openaiProvider());
await mkdir(".pi", { recursive: true });
const storage = await openNodeSqliteStorage(".pi/recovery.sqlite");
const harness = await Harness.open(
  storage, { models, registry: createRegistry() }, context,
);

try {
  const root = await harness.root(context, {
    agent: { model: { provider: "openai", modelId } },
  });
  harness.resume();
  const submission = await root.submit({
    type: "input",
    content: "解释国内订单5000分免基础运费、加急另加800分的规则。",
    requestId: "shipping-rule-001",
  }, context);
  console.log({ submissionId: submission.id });
  const settled = await submission.wait(context);
  if (settled.status !== "done" || settled.type !== "input") {
    throw new Error("Durable input unanswered: " + JSON.stringify(settled));
  }
  const answer = await root.commit(
    (tx) => tx.entry(AssistantEntry, settled.answer), context,
  );
  if (!answer) throw new Error("Committed answer entry is missing");
  console.log(answer.model?.[0]);
} finally {
  await harness.close(context);
}
