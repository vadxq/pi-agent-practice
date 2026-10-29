import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentToolResult, ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const PREVIEW_LINE_LIMIT: number = 80;
const PREVIEW_CHARACTER_LIMIT: number = 6000;
const PARAMETERS = Type.Object({}, { additionalProperties: false });
const OUTPUT_SCHEMA = Type.Object({
  sourcePath: Type.String(),
  numberedSource: Type.String(),
  truncated: Type.Boolean(),
  expectedRules: Type.Array(Type.String()),
  verification: Type.Literal("not_run"),
});

type ContractEvidence = {
  sourcePath: string;
  numberedSource: string;
  truncated: boolean;
  expectedRules: string[];
  verification: "not_run";
};

interface EvidenceRequest {
  cwd: string;
  signal: AbortSignal | undefined;
}

type ToolArguments = Parameters<ToolDefinition<typeof PARAMETERS, ContractEvidence>["execute"]>;

// 只读取当前示例仓库中的固定文件；工具返回证据，不执行测试、不判定任务成功。
async function collectEvidence(request: EvidenceRequest): Promise<ContractEvidence> {
  const sourcePath: string = join(request.cwd, "src", "shipping.ts");
  request.signal?.throwIfAborted();
  const source: string = await readFile(sourcePath, { encoding: "utf8", signal: request.signal });
  const sourceLines: string[] = source.split("\n");
  const preview: string = sourceLines
    .slice(0, PREVIEW_LINE_LIMIT)
    .map((line: string, index: number): string => `${index + 1}: ${line}`)
    .join("\n");
  const numberedSource: string = preview.slice(0, PREVIEW_CHARACTER_LIMIT);
  return {
    sourcePath,
    numberedSource,
    truncated: sourceLines.length > PREVIEW_LINE_LIMIT || preview.length > PREVIEW_CHARACTER_LIMIT,
    expectedRules: [
      "国内 subtotalCents >= 5000 时基础运费为 0，否则为 500。",
      "国际订单基础运费为 2000，不参加国内免邮。",
      "expedited 为 true 时在基础运费上增加 800。",
    ],
    verification: "not_run",
  };
}

export default function shippingContract(pi: ExtensionAPI): void {
  pi.registerTool<typeof PARAMETERS, ContractEvidence>({
    name: "shipping_contract",
    label: "Shipping contract evidence",
    description: "读取当前练习仓库 src/shipping.ts，返回带行号的源码与课程运费规则；不运行验证。",
    promptSnippet: "Read shipping source evidence and the exercise contract without changing files.",
    parameters: PARAMETERS,
    outputSchema: OUTPUT_SCHEMA,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    // Pi 的固定 execute 接口有五个参数；rest tuple 保留其准确类型。
    execute: async (...call: ToolArguments): Promise<AgentToolResult<ContractEvidence>> => {
      const [, , signal, , context] = call;
      const evidence: ContractEvidence = await collectEvidence({ cwd: context.cwd, signal });
      return {
        content: [{ type: "text", text: JSON.stringify(evidence, null, 2) }],
        structuredContent: evidence,
        details: evidence,
      };
    },
  });
}
