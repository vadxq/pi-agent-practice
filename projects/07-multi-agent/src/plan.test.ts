import assert from "node:assert/strict";
import test from "node:test";
import { planLevels } from "./plan.js";

const code = Object.freeze({ nodeId: "code", dependsOn: [], role: "writer", allowedPaths: ["src/shipping.ts"], required: true });
const docs = Object.freeze({ nodeId: "docs", dependsOn: [], role: "writer", allowedPaths: ["README.md"], required: true });
const integrate = Object.freeze({ nodeId: "integrate", dependsOn: ["code", "docs"], role: "integrator", allowedPaths: ["src/shipping.ts", "README.md"], required: true });

test("两个独立 writer 同层，整合必须等待两者", (): void => {
  const input = Object.freeze({ nodes: Object.freeze([integrate, code, docs]) });
  assert.deepEqual(planLevels(input).map((level) => level.map((node) => node.nodeId)), [["code", "docs"], ["integrate"]]);
  assert.deepEqual(input.nodes[0], integrate);
});

test("拒绝重复、未知依赖、环和越界路径", (): void => {
  assert.throws(() => planLevels({ nodes: [code, code] }), RangeError);
  assert.throws(() => planLevels({ nodes: [{ ...code, dependsOn: ["missing"] }] }), RangeError);
  assert.throws(() => planLevels({ nodes: [{ ...code, dependsOn: ["docs"] }, { ...docs, dependsOn: ["code"] }] }), RangeError);
  assert.throws(() => planLevels({ nodes: [{ ...code, allowedPaths: ["../secret"] }] }), RangeError);
});
