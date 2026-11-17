import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { planLevels } from "./plan.js";

const { values } = parseArgs({ options: { plan: { type: "string" } }, strict: true });
if (!values.plan) throw new TypeError("缺少 --plan");
const value: unknown = JSON.parse(await readFile(values.plan, "utf8"));
console.log(JSON.stringify({ passed: true, levels: planLevels(value), execution: "not_run", modelRequests: 0 }, null, 2));
