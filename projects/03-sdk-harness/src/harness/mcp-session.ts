import {
  createAgentSession, createCodemodeExtension, createMcpExtension, createToolSearchExtension,
  DefaultResourceLoader, SessionManager, SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { AgentSession, ModelRuntime } from "@earendil-works/pi-coding-agent";

/** 第 09 章的可选组装；主 harness 不隐式启用外部 MCP 能力。 */
export async function createMcpSession(input: {
  readonly workspace: string;
  readonly agentDir: string;
  readonly runtime: ModelRuntime;
  readonly provider: string;
  readonly modelId: string;
}): Promise<AgentSession> {
  const model: ReturnType<ModelRuntime["getModel"]> = input.runtime.getModel(input.provider, input.modelId);
  if (model === undefined) throw new RangeError("指定的 MCP 实验模型不在模型目录中");
  const settings: SettingsManager = SettingsManager.inMemory({
    defaultTools: ["read", "grep", "find", "ls", "codemode", "tool_search"],
    defaultProjectTrust: "never", retry: { enabled: false }, compaction: { enabled: false }, cacheWarming: "off",
  }, { projectTrusted: false });
  const loader: DefaultResourceLoader = new DefaultResourceLoader({
    cwd: input.workspace, agentDir: input.agentDir, settingsManager: settings,
    noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    extensionFactories: [createCodemodeExtension({ mode: "on" }), createToolSearchExtension(), createMcpExtension()],
  });
  await loader.reload();
  const { session } = await createAgentSession({
    cwd: input.workspace, agentDir: input.agentDir, modelRuntime: input.runtime, model,
    thinkingLevel: "off", resourceLoader: loader, settingsManager: settings,
    sessionManager: SessionManager.inMemory(input.workspace),
  });
  try {
    await session.bindExtensions({});
    return session;
  } catch (error: unknown) {
    session.dispose();
    throw error;
  }
}
