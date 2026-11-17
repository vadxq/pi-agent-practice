import assert from "node:assert/strict";
import test from "node:test";
import { evaluateShipping } from "../acceptance.js";
import type { CaseResult } from "../acceptance.js";
import { calculateShipping } from "../src/shipping.js";

const results: readonly CaseResult[] = evaluateShipping(calculateShipping);
for (const result of results) {
  test(result.id, (): void => {
    assert.equal(result.passed, true, JSON.stringify(result));
  });
}
