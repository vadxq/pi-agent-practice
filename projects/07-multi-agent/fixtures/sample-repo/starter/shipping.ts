export type Region = "domestic" | "international";

export interface ShippingInput {
  readonly subtotalCents: number;
  readonly region: Region;
  readonly expedited: boolean;
}

const FREE_SHIPPING_THRESHOLD: number = 5_000;
const DOMESTIC_BASE_FEE: number = 500;
const INTERNATIONAL_BASE_FEE: number = 2_000;
const EXPEDITED_SURCHARGE: number = 800;
const ZERO: number = 0;

/** 练习起点：边界实现有意保留缺陷，由任务描述与验收发现。 */
export function calculateShipping(input: ShippingInput): number {
  if (!Number.isSafeInteger(input.subtotalCents) || input.subtotalCents < ZERO) {
    throw new RangeError("subtotalCents must be a nonnegative safe integer");
  }
  if (input.region !== "domestic" && input.region !== "international") {
    throw new TypeError("region must be domestic or international");
  }
  if (typeof input.expedited !== "boolean") {
    throw new TypeError("expedited must be boolean");
  }
  const domesticFee: number = input.subtotalCents > FREE_SHIPPING_THRESHOLD ? ZERO : DOMESTIC_BASE_FEE;
  const baseFee: number = input.region === "domestic" ? domesticFee : INTERNATIONAL_BASE_FEE;
  return baseFee + (input.expedited ? EXPEDITED_SURCHARGE : ZERO);
}
