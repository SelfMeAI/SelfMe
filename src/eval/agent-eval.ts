#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { AnthropicProvider } from "../providers/anthropic.js";
import { OpenAIProvider } from "../providers/openai.js";
import type { ProviderClient } from "../providers/base.js";

import { runEvalTask, validateEvalTask } from "./runner.js";
import { baselineEvalTasks } from "./suite.js";
import type { EvalSuiteResult } from "./types.js";

const args = process.argv.slice(2);
const taskId = getFlagValue("--task");
const reportPath = getFlagValue("--report");
const dryRun = args.includes("--dry-run");
const list = args.includes("--list");

if (list) {
  for (const task of baselineEvalTasks) {
    console.log(`${task.id}\t${task.title}`);
  }
  process.exit(0);
}

const selectedTasks = taskId
  ? baselineEvalTasks.filter((task) => task.id === taskId)
  : baselineEvalTasks;

if (selectedTasks.length === 0) {
  throw new Error(`Unknown eval task: ${taskId}`);
}

const definitionErrors = (await Promise.all(selectedTasks.map(validateEvalTask))).flat();

if (definitionErrors.length > 0) {
  throw new Error(`Invalid eval suite:\n${definitionErrors.map((error) => `- ${error}`).join("\n")}`);
}

if (dryRun) {
  console.log(`Eval suite is valid: ${selectedTasks.length} task(s).`);
  for (const task of selectedTasks) {
    console.log(`- ${task.id}: ${task.title}`);
  }
  process.exit(0);
}

const provider = createProviderFromEnvironment();
const startedAt = new Date().toISOString();
const results = [];

for (const task of selectedTasks) {
  console.log(`eval: ${task.id}`);
  const result = await runEvalTask({ task, provider });
  results.push(result);
  console.log(`${result.passed ? "PASS" : "FAIL"} ${task.id} · ${result.taskState} · ${Math.round(result.durationMs / 1000)}s`);

  for (const assertion of result.assertions.filter((assertion) => !assertion.passed)) {
    console.log(`  ${assertion.label}: ${assertion.detail ?? "failed"}`);
  }

  for (const warning of result.qualityWarnings) {
    console.log(`  warning: ${warning}`);
  }
}

const report: EvalSuiteResult = {
  startedAt,
  finishedAt: new Date().toISOString(),
  provider: provider.name,
  passed: results.every((result) => result.passed),
  tasks: results
};

if (reportPath) {
  const target = resolve(reportPath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`report: ${target}`);
}

process.exit(report.passed ? 0 : 1);

function getFlagValue(flag: string) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function createProviderFromEnvironment(): ProviderClient {
  const protocol = process.env.SELFME_EVAL_PROTOCOL;
  const baseUrl = process.env.SELFME_EVAL_BASE_URL;
  const apiKey = process.env.SELFME_EVAL_API_KEY;
  const model = process.env.SELFME_EVAL_MODEL;

  if (!protocol || !baseUrl || !apiKey || !model) {
    throw new Error(
      "Real evaluation requires SELFME_EVAL_PROTOCOL, SELFME_EVAL_BASE_URL, SELFME_EVAL_API_KEY, and SELFME_EVAL_MODEL. Use --dry-run to validate the suite without a provider."
    );
  }

  if (protocol === "openai") {
    return new OpenAIProvider({ baseUrl, apiKey, model });
  }

  if (protocol === "anthropic") {
    return new AnthropicProvider({ baseUrl, apiKey, model });
  }

  throw new Error(`Unsupported SELFME_EVAL_PROTOCOL: ${protocol}`);
}
