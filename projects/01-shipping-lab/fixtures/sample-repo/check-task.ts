import assert from "node:assert/strict";
import { evaluateShipping } from "./acceptance.js";
import type { CaseResult } from "./acceptance.js";
import { calculateShipping as fixed } from "./src/shipping.js";
import { calculateShipping as starter } from "./starter/shipping.js";

const fixedResults: readonly CaseResult[] = evaluateShipping(fixed);
const starterResults: readonly CaseResult[] = evaluateShipping(starter);
const starterFailures: readonly string[] = starterResults.filter((result: CaseResult): boolean => !result.passed).map((result: CaseResult): string => result.id);
assert.equal(fixedResults.every((result: CaseResult): boolean => result.passed), true);
assert.deepEqual(starterFailures, ["domestic-boundary", "expedited-boundary"]);
process.stdout.write(JSON.stringify({ fixedPassed: fixedResults.length, starterFailures, oracleVerified: true }) + "\n");
