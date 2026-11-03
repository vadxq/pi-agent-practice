import type { ShippingInput } from "./src/shipping.js";

export interface ShippingCase {
  readonly id: string;
  readonly input: ShippingInput;
  readonly expected: number | "RangeError";
}

export interface CaseResult {
  readonly id: string;
  readonly passed: boolean;
  readonly expected: number | "RangeError";
  readonly actual: number | string;
}

export type ShippingCalculator = (input: ShippingInput) => number;

export const SHIPPING_CASES: readonly ShippingCase[] = [
  { id: "domestic-zero", input: { subtotalCents: 0, region: "domestic", expedited: false }, expected: 500 },
  { id: "domestic-below", input: { subtotalCents: 4_999, region: "domestic", expedited: false }, expected: 500 },
  { id: "domestic-boundary", input: { subtotalCents: 5_000, region: "domestic", expedited: false }, expected: 0 },
  { id: "domestic-above", input: { subtotalCents: 5_001, region: "domestic", expedited: false }, expected: 0 },
  { id: "expedited-below", input: { subtotalCents: 4_999, region: "domestic", expedited: true }, expected: 1_300 },
  { id: "expedited-boundary", input: { subtotalCents: 5_000, region: "domestic", expedited: true }, expected: 800 },
  { id: "international-below", input: { subtotalCents: 4_999, region: "international", expedited: false }, expected: 2_000 },
  { id: "international-above", input: { subtotalCents: 9_000, region: "international", expedited: false }, expected: 2_000 },
  { id: "international-expedited", input: { subtotalCents: 5_000, region: "international", expedited: true }, expected: 2_800 },
  { id: "negative", input: { subtotalCents: -1, region: "domestic", expedited: false }, expected: "RangeError" },
  { id: "fractional", input: { subtotalCents: 0.5, region: "domestic", expedited: false }, expected: "RangeError" },
  { id: "infinite", input: { subtotalCents: Infinity, region: "domestic", expedited: false }, expected: "RangeError" },
];

export function evaluateShipping(calculator: ShippingCalculator): readonly CaseResult[] {
  return SHIPPING_CASES.map((entry: ShippingCase): CaseResult => {
    try {
      const actual: number = calculator(entry.input);
      return { id: entry.id, expected: entry.expected, actual, passed: actual === entry.expected };
    } catch (error: unknown) {
      // 这里是验收边界：把具体运行异常保留为结果，不能把异常当作成功值。
      const actual: string = error instanceof Error ? error.name : "NonErrorThrown";
      return { id: entry.id, expected: entry.expected, actual, passed: actual === entry.expected };
    }
  });
}
