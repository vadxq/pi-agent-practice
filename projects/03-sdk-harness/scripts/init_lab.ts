import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

const parsed: ReturnType<typeof parseArgs> = parseArgs({ options: { name: { type: "string" } }, strict: true });
const name: string = typeof parsed.values.name === "string" ? parsed.values.name : "shipping";
if (!/^[a-z][a-z0-9-]{0,39}$/.test(name)) throw new TypeError("name must contain lowercase letters, digits, or hyphens");
const courseRoot: string = process.cwd();
const destination: string = resolve(courseRoot, ".pi/labs", name);
await mkdir(resolve(courseRoot, ".pi/labs"), { recursive: true });
try {
  await mkdir(destination);
} catch (error: unknown) {
  if (error instanceof Error && "code" in error && error.code === "EEXIST") {
    throw new Error("Lab already exists. Choose a new --name to preserve existing work.", { cause: error });
  }
  throw error;
}
await mkdir(resolve(destination, "src"));
const source: string = await readFile(resolve(courseRoot, "fixtures/sample-repo/starter/shipping.ts"), "utf8");
await writeFile(resolve(destination, "src/shipping.ts"), source);
await writeFile(resolve(destination, ".pi-course-lab.json"), JSON.stringify({ kind: "pi-shipping-lab", version: 1 }));
await writeFile(resolve(destination, "package.json"), JSON.stringify({ name: "pi-shipping-lab", private: true, type: "module", scripts: { test: "node --import tsx ../../../scripts/check_lab.ts --workspace ." } }, null, 2));
await writeFile(resolve(destination, "TASK.md"), "# 修复运费边界\n\n国内商品金额达到5000分时免基础运费，低于5000分收500分；国际订单始终收2000分基础费；加急额外收800分。非法金额应拒绝。保持接口不变，仅修改src/shipping.ts。用npm test验证。不要git commit或push。\n");
await writeFile(resolve(destination, "AGENTS.md"), "# 练习约束\n\n只修改src/shipping.ts。金额单位为分，不能改变国际与加急规则。不要修改TASK.md、测试或实验标记。不要commit、push或安装依赖。验收命令npm test。\n");
execFileSync("git", ["init", "--quiet"], { cwd: destination, stdio: "pipe" });
execFileSync("git", ["add", "--", "src/shipping.ts", ".pi-course-lab.json", "package.json", "TASK.md", "AGENTS.md"], { cwd: destination, stdio: "pipe" });
const baselineTree: string = execFileSync("git", ["write-tree"], { cwd: destination, encoding: "utf8" }).trim();
await writeFile(resolve(destination, ".git/pi-course-baseline"), baselineTree + "\n");
process.stdout.write(JSON.stringify({ workspace: destination, expectedInitialFailures: 2 }) + "\n");
