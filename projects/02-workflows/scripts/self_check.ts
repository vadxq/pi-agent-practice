import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { DefaultResourceLoader, SettingsManager } from "@earendil-works/pi-coding-agent";

const root: string = process.cwd();
await mkdir(".pi/self-check-agent", { recursive: true });
const loader: DefaultResourceLoader = new DefaultResourceLoader({
  cwd: resolve("fixtures/sample-repo"), agentDir: resolve(".pi/self-check-agent"),
  settingsManager: SettingsManager.inMemory({ defaultProjectTrust: "never" }, { projectTrusted: true }),
  noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
  additionalExtensionPaths: [resolve(root, "extensions/shipping-contract.ts"), resolve(root, "extensions/workflow-reminder.ts")],
  additionalSkillPaths: [resolve(root, "skills/shipping-review")],
  additionalPromptTemplatePaths: [resolve(root, "prompts/shipping-review.md")],
});
await loader.reload();
const extensions: ReturnType<typeof loader.getExtensions> = loader.getExtensions();
assert.deepEqual(extensions.errors, []);
assert.equal(extensions.extensions.length, 2);
assert.equal(loader.getSkills().skills.length, 1);
assert.equal(loader.getPrompts().prompts.length, 1);
assert.deepEqual(loader.getSkills().diagnostics, []);
assert.deepEqual(loader.getPrompts().diagnostics, []);
console.log(JSON.stringify({ passed: true, extensions: extensions.extensions.length, skills: 1, prompts: 1, modelRequests: 0 }));
