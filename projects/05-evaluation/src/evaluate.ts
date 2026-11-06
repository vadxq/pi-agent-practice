import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs, promisify } from "node:util";
import { evaluateShipping } from "../fixtures/sample-repo/acceptance.js";
import type { CaseResult, ShippingCalculator } from "../fixtures/sample-repo/acceptance.js";

const execute: typeof execFile.__promisify__ = promisify(execFile);
const { values } = parseArgs({ options: { workspace: { type: "string" } }, strict: true });
if (!values.workspace) throw new TypeError("缺少 --workspace，必须明确指定被评测的练习副本");
const workspace: string = resolve(values.workspace);
const started: number = performance.now();
const definition: Record<string, unknown> = JSON.parse(await readFile(new URL("../tasks/shipping-boundary.json", import.meta.url), "utf8")) as Record<string, unknown>;
const moduleValue: Record<string, unknown> = await import(pathToFileURL(resolve(workspace, "src/shipping.ts")).href) as Record<string, unknown>;
if (typeof moduleValue.calculateShipping !== "function") throw new TypeError("工作区缺少 calculateShipping 导出");
const cases: readonly CaseResult[] = evaluateShipping(moduleValue.calculateShipping as ShippingCalculator);
// 同时检查已暂存、未暂存与新建文件，避免只通过行为却越过修改范围。
const gitRoot = await execute("git", ["-C", workspace, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
if (resolve(gitRoot.stdout.trim()) !== workspace) throw new RangeError("评测工作区必须是独立 Git 根目录");
const staged = await execute("git", ["-C", workspace, "ls-files", "--stage", "-z"], { encoding: "utf8" });
const indexTree = await execute("git", ["-C", workspace, "write-tree"], { encoding: "utf8" });
const marker: Record<string, unknown> = JSON.parse(await readFile(resolve(workspace, ".pi-course-lab.json"), "utf8")) as Record<string, unknown>;
if (marker.kind !== "pi-shipping-lab") throw new TypeError("评测工作区缺少课程标记");
const baseline: string = (await readFile(resolve(workspace, ".git/pi-course-baseline"), "utf8")).trim();
if (!/^[a-f0-9]{40,64}$/.test(baseline)) throw new TypeError("评测基线无效，请使用本项目重新初始化副本");
const diff = await execute("git", ["-C", workspace, "--no-pager", "diff", "--name-only", "-z", baseline], { encoding: "utf8" });
const untracked = await execute("git", ["-C", workspace, "ls-files", "--others", "--exclude-standard", "-z"], { encoding: "utf8" });
const changedPaths: readonly string[] = [...new Set((diff.stdout + untracked.stdout).split("\0").filter(Boolean))];
const scopePassed: boolean = changedPaths.every((name: string): boolean => name === "src/shipping.ts");
const behaviorPassed: boolean = cases.every((entry: CaseResult): boolean => entry.passed);
const passed: boolean = behaviorPassed && scopePassed;
const report = {
  taskId: definition.id, workspace, checkedAt: new Date().toISOString(), passed,
  behaviorPassed, scopePassed, changedPaths, cases, durationMs: performance.now() - started,
  // 这是本地验收，不冒充模型运行、独立 reviewer 或费用测量。
  modelRun: "not_run", review: "not_run", tokens: null, costUsd: null,
  evidence: { baselineTree: baseline, currentIndexTree: indexTree.stdout.trim(), trackedEntries: staged.stdout.split("\0").filter(Boolean).length },
};
const directory: string = fileURLToPath(new URL("../.pi/evals/", import.meta.url));
await mkdir(directory, { recursive: true });
await writeFile(resolve(directory, "latest.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report));
process.exitCode = passed ? 0 : 1;
