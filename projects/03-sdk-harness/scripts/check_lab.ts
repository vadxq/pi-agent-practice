import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { evaluateShipping } from "../fixtures/sample-repo/acceptance.js";
import type { CaseResult, ShippingCalculator } from "../fixtures/sample-repo/acceptance.js";

const parsed: ReturnType<typeof parseArgs> = parseArgs({ options: { workspace: { type: "string" } }, strict: true });
const workspace: string = typeof parsed.values.workspace === "string" ? parsed.values.workspace : ".pi/labs/shipping";
const sourcePath: string = resolve(workspace, "src/shipping.ts");
await access(sourcePath);
const moduleValue: Record<string, unknown> = await import(pathToFileURL(sourcePath).href) as Record<string, unknown>;
if (typeof moduleValue.calculateShipping !== "function") throw new TypeError("calculateShipping export must be a function");
const cases: readonly CaseResult[] = evaluateShipping(moduleValue.calculateShipping as ShippingCalculator);
const passed: boolean = cases.every((entry: CaseResult): boolean => entry.passed);
process.stdout.write(JSON.stringify({ passed, sourcePath, cases }) + "\n");
process.exitCode = passed ? 0 : 1;
