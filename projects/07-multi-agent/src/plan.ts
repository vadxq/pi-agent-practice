export interface PlanNode {
  readonly nodeId: string;
  readonly dependsOn: readonly string[];
  readonly role: "writer" | "integrator";
  readonly allowedPaths: readonly string[];
  readonly required: boolean;
}

const MAX_NODES: number = 8;
const ALLOWED_PATHS: ReadonlySet<string> = new Set(["src/shipping.ts", "README.md"]);

/** 纯转换：拒绝未知节点与环，返回可按层执行的计划，不修改输入。 */
export function planLevels(value: unknown): readonly (readonly PlanNode[])[] {
  if (typeof value !== "object" || value === null || !("nodes" in value) || !Array.isArray(value.nodes)) {
    throw new TypeError("计划必须包含 nodes 数组");
  }
  if (value.nodes.length === 0 || value.nodes.length > MAX_NODES) throw new RangeError("节点数量必须为 1 至 8");
  const nodes: readonly PlanNode[] = value.nodes.map((node: unknown): PlanNode => {
    if (typeof node !== "object" || node === null) throw new TypeError("节点必须是 object");
    const record: Record<string, unknown> = node as Record<string, unknown>;
    if (typeof record.nodeId !== "string" || !/^[a-z][a-z0-9-]*$/.test(record.nodeId)) throw new TypeError("nodeId 无效");
    if (record.role !== "writer" && record.role !== "integrator") throw new TypeError("role 未授权");
    if (!Array.isArray(record.dependsOn) || !record.dependsOn.every((id: unknown): boolean => typeof id === "string")) throw new TypeError("dependsOn 必须是字符串数组");
    if (!Array.isArray(record.allowedPaths) || record.allowedPaths.length === 0 || !record.allowedPaths.every((path: unknown): boolean => typeof path === "string" && ALLOWED_PATHS.has(path))) throw new RangeError("allowedPaths 含未授权路径");
    if (typeof record.required !== "boolean") throw new TypeError("required 必须是 boolean");
    return { nodeId: record.nodeId, role: record.role, dependsOn: [...record.dependsOn] as string[], allowedPaths: [...record.allowedPaths] as string[], required: record.required };
  });
  const ids: ReadonlySet<string> = new Set(nodes.map((node: PlanNode): string => node.nodeId));
  if (ids.size !== nodes.length) throw new RangeError("nodeId 重复");
  if (nodes.some((node: PlanNode): boolean => node.dependsOn.some((id: string): boolean => !ids.has(id)))) throw new RangeError("存在未知依赖");
  return collectLevels(nodes, []);
}

function collectLevels(pending: readonly PlanNode[], completed: readonly string[]): readonly (readonly PlanNode[])[] {
  if (pending.length === 0) return [];
  const ready: readonly PlanNode[] = pending.filter((node: PlanNode): boolean => node.dependsOn.every((id: string): boolean => completed.includes(id)));
  if (ready.length === 0) throw new RangeError("计划存在循环依赖");
  const readyIds: readonly string[] = ready.map((node: PlanNode): string => node.nodeId);
  const remaining: readonly PlanNode[] = pending.filter((node: PlanNode): boolean => !readyIds.includes(node.nodeId));
  return [ready, ...collectLevels(remaining, [...completed, ...readyIds])];
}
