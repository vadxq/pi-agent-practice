import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describeError } from "./contracts.js";
import type { ValidationResult } from "./types.js";

const execute: typeof execFile.__promisify__ = promisify(execFile);
const CHECK_SCRIPT: string = fileURLToPath(new URL("../../scripts/check_lab.ts", import.meta.url));
const MAX_OUTPUT_BYTES: number = 512_000;
const VALIDATION_TIMEOUT_MS: number = 30_000;

/** 固定宿主脚本，模型不能把这项验收替换成任意 shell。 */
export async function verifyShippingWorkspace(workspace: string, signal: AbortSignal): Promise<ValidationResult> {
  const args: string[] = ["--import", "tsx", CHECK_SCRIPT, "--workspace", workspace];
  const command: string = `node --import tsx scripts/check_lab.ts --workspace ${JSON.stringify(workspace)}`;
  try {
    const result = await execute(process.execPath, args, { encoding: "utf8", signal, timeout: VALIDATION_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES });
    const parsed: unknown = JSON.parse(result.stdout);
    if (typeof parsed !== "object" || parsed === null || !("passed" in parsed) || parsed.passed !== true) {
      throw new TypeError("固定验收脚本退出 0，但未返回 passed:true");
    }
    return { name: "shipping-contract", status: "passed", command, exitCode: 0, output: result.stdout };
  } catch (error: unknown) {
    const code: unknown = typeof error === "object" && error !== null && "code" in error ? error.code : null;
    const stdout: unknown = typeof error === "object" && error !== null && "stdout" in error ? error.stdout : "";
    const stderr: unknown = typeof error === "object" && error !== null && "stderr" in error ? error.stderr : "";
    return {
      name: "shipping-contract", status: signal.aborted ? "cancelled" : "failed", command,
      exitCode: typeof code === "number" ? code : null,
      output: [describeError(error), String(stdout), String(stderr)].join("\n"),
    };
  }
}
