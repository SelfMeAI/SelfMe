import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";

import { EventBus } from "../app/event-bus.js";
import type { ProviderClient } from "../providers/base.js";
import { AgentRuntime } from "../runtime/agent.js";
import { createDefaultSessionRecord } from "../runtime/context.js";
import {
  createRuntimeInterruptRequestedEvent,
  createTerminalCommandInvokedEvent,
  createUserMessageSubmittedEvent
} from "../runtime/events.js";
import { LogStore } from "../storage/logs.js";
import { TranscriptStore } from "../storage/transcripts.js";
import { InMemoryToolRegistry } from "../tools/registry.js";
import type {
  EvalAssertionResult,
  EvalCommandExpectation,
  EvalFileExpectation,
  EvalTaskDefinition,
  EvalTaskResult
} from "./types.js";

const DEFAULT_TASK_TIMEOUT_MS = 120_000;

export async function validateEvalTask(task: EvalTaskDefinition) {
  const errors: string[] = [];

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(task.id)) {
    errors.push(`Task id must use lowercase kebab case: ${task.id}`);
  }

  if (!task.prompt.trim()) {
    errors.push(`Task ${task.id} needs a prompt.`);
  }

  if (
    task.interruption
    && (
      !task.interruption.followUp.trim()
      || (!task.interruption.afterToolSummaryIncludes?.trim() && !task.interruption.afterApprovalToolName?.trim())
    )
  ) {
    errors.push(`Task ${task.id} interruption needs a tool-summary or approval-tool matcher and follow-up.`);
  }

  for (const path of Object.keys(task.fixture)) {
    if (!isSafeRelativePath(path)) {
      errors.push(`Task ${task.id} contains an unsafe fixture path: ${path}`);
    }
  }

  for (const expectation of task.expectations.files ?? []) {
    if (!isSafeRelativePath(expectation.path)) {
      errors.push(`Task ${task.id} contains an unsafe file expectation path: ${expectation.path}`);
    }

    if (!expectation.equals && !expectation.includes) {
      errors.push(`Task ${task.id} file expectation needs equals or includes: ${expectation.path}`);
    }
  }

  for (const expectation of task.expectations.commands ?? []) {
    if (!expectation.command.trim()) {
      errors.push(`Task ${task.id} contains an empty command expectation.`);
    }

    if (expectation.stdoutEquals !== undefined && expectation.stdoutIncludes !== undefined) {
      errors.push(`Task ${task.id} command expectation cannot use stdoutEquals and stdoutIncludes together: ${expectation.command}`);
    }
  }

  const approvalExpectation = task.expectations.approvalCount;

  if (approvalExpectation) {
    if (approvalExpectation.min !== undefined && (!Number.isInteger(approvalExpectation.min) || approvalExpectation.min < 0)) {
      errors.push(`Task ${task.id} approval minimum must be a non-negative integer.`);
    }

    if (approvalExpectation.max !== undefined && (!Number.isInteger(approvalExpectation.max) || approvalExpectation.max < 0)) {
      errors.push(`Task ${task.id} approval maximum must be a non-negative integer.`);
    }

    if (
      approvalExpectation.min !== undefined
      && approvalExpectation.max !== undefined
      && approvalExpectation.min > approvalExpectation.max
    ) {
      errors.push(`Task ${task.id} approval minimum cannot exceed its maximum.`);
    }
  }

  for (const expectation of task.expectations.requiredToolCalls ?? []) {
    if (!expectation.toolName?.trim() && !expectation.summaryIncludes?.trim()) {
      errors.push(`Task ${task.id} required tool call needs a tool name or summary matcher.`);
    }
  }

  return errors;
}

export async function runEvalTask(input: {
  task: EvalTaskDefinition;
  provider: ProviderClient;
  timeoutMs?: number;
}): Promise<EvalTaskResult> {
  const validationErrors = await validateEvalTask(input.task);

  if (validationErrors.length > 0) {
    return {
      id: input.task.id,
      title: input.task.title,
      passed: false,
      taskState: "failed",
      durationMs: 0,
      approvalCount: 0,
      resumed: false,
      assistantText: "",
      toolSummaries: [],
      toolCalls: [],
      runtimeErrors: validationErrors,
      assertions: validationErrors.map((detail) => ({
        label: "task definition",
        passed: false,
        detail
      })),
      qualityWarnings: []
    };
  }

  const root = await mkdtemp(join(tmpdir(), `selfme-eval-${input.task.id}-`));
  const workspace = join(root, "workspace");
  const transcriptPath = join(root, "transcript.jsonl");
  const logsPath = join(root, "tool-logs.jsonl");
  await mkdir(workspace, { recursive: true });
  await writeFixture(workspace, input.task.fixture);

  const bus = new EventBus();
  const transcriptStore = new TranscriptStore(transcriptPath);
  const logStore = new LogStore(logsPath);
  await transcriptStore.ensureInitialized();
  await logStore.ensureInitialized();

  const session = createDefaultSessionRecord(workspace, "eval");
  session.model = input.provider.name;
  const runtime = new AgentRuntime({
    bus,
    provider: input.provider,
    tools: new InMemoryToolRegistry(),
    session,
    transcriptStore,
    logStore
  });
  await runtime.start();

  const toolSummaries: string[] = [];
  const toolCalls: EvalTaskResult["toolCalls"] = [];
  const runtimeErrors: string[] = [];
  let assistantText = "";
  let approvalCount = 0;
  let initialTaskId: string | undefined;
  let resumedTaskId: string | undefined;
  const visibleTaskIds = new Set<string>();
  let interruptionRequested = false;
  let resumed = false;
  let timedOut = false;
  let interruptionSummary: string | undefined;
  const startedAt = Date.now();

  let resolveCompletion: ((state: "completed" | "failed" | "cancelled") => void) | undefined;
  let completionSettled = false;
  const completion = new Promise<"completed" | "failed" | "cancelled">((resolve) => {
    resolveCompletion = resolve;
  });
  const complete = (state: "completed" | "failed" | "cancelled") => {
    if (completionSettled) {
      return;
    }

    completionSettled = true;
    offTaskState();
    resolveCompletion?.(state);
  };
  const offTaskState = bus.on("task.state.changed", (event) => {
    if (event.payload.state === "running" && event.payload.title === "Respond to user input" && event.taskId) {
      visibleTaskIds.add(event.taskId);

      if (!initialTaskId) {
        initialTaskId = event.taskId;
      } else if (resumed && !resumedTaskId && event.taskId !== initialTaskId) {
        resumedTaskId = event.taskId;
      }

      return;
    }

    if (event.payload.state !== "completed" && event.payload.state !== "failed" && event.payload.state !== "cancelled") {
      return;
    }

    if (
      event.taskId === initialTaskId
      && interruptionRequested
      && event.payload.state === "cancelled"
      && !resumed
    ) {
      return;
    }

    const finalTaskId = resumed ? resumedTaskId : initialTaskId;

    if (event.taskId === finalTaskId) {
      complete(event.payload.state);
    }
  });

  const offTool = bus.on("tool.execution.completed", (event) => {
    toolSummaries.push(event.payload.summary);
    toolCalls.push({
      toolName: event.payload.toolName,
      summary: event.payload.summary
    });

    if (
      input.task.interruption
      && initialTaskId
      && !resumed
      && !interruptionRequested
      && input.task.interruption.afterToolSummaryIncludes
      && event.payload.summary.includes(input.task.interruption.afterToolSummaryIncludes)
    ) {
      interruptionRequested = true;
      interruptionSummary = event.payload.summary;
      bus.emit(createRuntimeInterruptRequestedEvent({
        sessionId: session.sessionId,
        reason: "cancel"
      }));
    }
  });
  const offRuntimeError = bus.on("runtime.error.raised", (event) => {
    runtimeErrors.push(event.payload.message);
  });
  const offAssistantDelta = bus.on("assistant.delta.received", (event) => {
    if (event.taskId && visibleTaskIds.has(event.taskId)) {
      assistantText += event.payload.delta;
    }
  });
  const offApproval = bus.on("approval.requested", (event) => {
    approvalCount += 1;

    if (
      input.task.interruption
      && initialTaskId
      && !resumed
      && !interruptionRequested
      && input.task.interruption.afterApprovalToolName
      && event.payload.toolName === input.task.interruption.afterApprovalToolName
    ) {
      interruptionRequested = true;
      interruptionSummary = `approval requested for ${event.payload.toolName}`;
      bus.emit(createRuntimeInterruptRequestedEvent({
        sessionId: session.sessionId,
        reason: "cancel"
      }));
      return;
    }

    bus.emit(createTerminalCommandInvokedEvent({
      sessionId: event.sessionId,
      content: `/approve ${event.payload.approvalId}`
    }));
  });
  const offBusy = bus.on("runtime.busy.changed", (event) => {
    if (!event.payload.active && interruptionRequested && !resumed && input.task.interruption) {
      resumed = true;
      setTimeout(() => {
        bus.emit(createUserMessageSubmittedEvent({
          sessionId: session.sessionId,
          content: input.task.interruption!.followUp
        }));
      }, 0);
    }
  });

  const timeoutMs = input.timeoutMs ?? DEFAULT_TASK_TIMEOUT_MS;
  const timeout = setTimeout(() => {
    timedOut = true;

    if ((interruptionRequested && !resumed) || (resumed && !resumedTaskId)) {
      complete("cancelled");
      return;
    }

    bus.emit(createRuntimeInterruptRequestedEvent({
      sessionId: session.sessionId,
      reason: "cancel"
    }));
  }, timeoutMs);

  bus.emit(createUserMessageSubmittedEvent({
    sessionId: session.sessionId,
    content: input.task.prompt
  }));

  const taskState = await completion;
  clearTimeout(timeout);
  offTool();
  offRuntimeError();
  offAssistantDelta();
  offApproval();
  offBusy();

  const assertions = await evaluateTaskArtifacts(workspace, input.task);
  if (input.task.interruption && (!interruptionRequested || !resumedTaskId)) {
    assertions.unshift({
      label: "interruption resume",
      passed: false,
      detail: interruptionRequested
        ? "The task was interrupted but did not start a resumed turn."
        : input.task.interruption.afterToolSummaryIncludes
          ? `No tool result matched ${JSON.stringify(input.task.interruption.afterToolSummaryIncludes)} before task completion.`
          : `No approval request matched ${JSON.stringify(input.task.interruption.afterApprovalToolName)} before task completion.`
    });
  }
  const approvalAssertion = evaluateApprovalExpectation(input.task, approvalCount);

  if (approvalAssertion) {
    assertions.push(approvalAssertion);
  }
  assertions.push(...evaluateRequiredToolCallExpectations(input.task, toolCalls));
  assertions.push(evaluateAssistantExpectation(input.task, assistantText));

  if (timedOut && taskState === "cancelled") {
    assertions.unshift({
      label: "task timeout",
      passed: false,
      detail: `Task exceeded ${timeoutMs}ms.`
    });
  }

  const passed = taskState === "completed" && assertions.every((assertion) => assertion.passed);
  const qualityWarnings = collectQualityWarnings(input.task, toolSummaries);

  return {
    id: input.task.id,
    title: input.task.title,
    passed,
    taskState,
    durationMs: Date.now() - startedAt,
    approvalCount,
    resumed: Boolean(resumedTaskId),
    interruptionSummary,
    assistantText,
    toolSummaries,
    toolCalls,
    runtimeErrors,
    assertions,
    qualityWarnings
  };
}

export async function evaluateTaskArtifacts(workspace: string, task: EvalTaskDefinition) {
  const assertions: EvalAssertionResult[] = [];

  for (const expectation of task.expectations.files ?? []) {
    assertions.push(await evaluateFileExpectation(workspace, expectation));
  }

  for (const expectation of task.expectations.commands ?? []) {
    assertions.push(await evaluateCommandExpectation(workspace, expectation));
  }

  return assertions;
}

function evaluateAssistantExpectation(task: EvalTaskDefinition, assistantText: string): EvalAssertionResult {
  const expectedValues = task.expectations.assistantIncludesAny ?? [];

  if (expectedValues.length === 0) {
    return {
      label: "final assistant response",
      passed: true
    };
  }

  if (expectedValues.some((value) => assistantText.includes(value))) {
    return {
      label: "final assistant response",
      passed: true
    };
  }

  return {
    label: "final assistant response",
    passed: false,
    detail: `Expected the final response to mention one of ${expectedValues.map((value) => JSON.stringify(value)).join(", ")}. Got ${JSON.stringify(clipOutput(assistantText))}.`
  };
}

function evaluateApprovalExpectation(task: EvalTaskDefinition, approvalCount: number): EvalAssertionResult | undefined {
  const expectation = task.expectations.approvalCount;

  if (!expectation) {
    return undefined;
  }

  if (expectation.min !== undefined && approvalCount < expectation.min) {
    return {
      label: "approval count",
      passed: false,
      detail: `Expected at least ${expectation.min} approval(s), got ${approvalCount}.`
    };
  }

  if (expectation.max !== undefined && approvalCount > expectation.max) {
    return {
      label: "approval count",
      passed: false,
      detail: `Expected at most ${expectation.max} approval(s), got ${approvalCount}.`
    };
  }

  return {
    label: "approval count",
    passed: true
  };
}

function evaluateRequiredToolCallExpectations(
  task: EvalTaskDefinition,
  toolCalls: EvalTaskResult["toolCalls"]
): EvalAssertionResult[] {
  return (task.expectations.requiredToolCalls ?? []).map((expectation) => {
    const matched = toolCalls.some((call) => (
      (!expectation.toolName || call.toolName === expectation.toolName)
      && (!expectation.summaryIncludes || call.summary.includes(expectation.summaryIncludes))
    ));
    const label = expectation.toolName
      ? `required tool call ${expectation.toolName}`
      : "required tool call";

    return matched
      ? { label, passed: true }
      : {
        label,
        passed: false,
        detail: `Missing tool call matching ${JSON.stringify(expectation)}.`
      };
  });
}

function collectQualityWarnings(task: EvalTaskDefinition, toolSummaries: string[]) {
  const warnings: string[] = [];
  const recommendedMaxToolCalls = task.quality?.recommendedMaxToolCalls;

  if (recommendedMaxToolCalls !== undefined && toolSummaries.length > recommendedMaxToolCalls) {
    warnings.push(
      `Used ${toolSummaries.length} tool calls; the recommended budget for ${task.id} is ${recommendedMaxToolCalls}.`
    );
  }

  return warnings;
}

async function writeFixture(workspace: string, fixture: Record<string, string>) {
  for (const [path, content] of Object.entries(fixture)) {
    const target = resolveSafeWorkspacePath(workspace, path);
    await mkdir(resolve(target, ".."), { recursive: true });
    await writeFile(target, content, "utf8");
  }
}

async function evaluateFileExpectation(workspace: string, expectation: EvalFileExpectation): Promise<EvalAssertionResult> {
  const label = `file ${expectation.path}`;

  try {
    const content = await readFile(resolveSafeWorkspacePath(workspace, expectation.path), "utf8");

    if (expectation.equals !== undefined && content !== expectation.equals) {
      return {
        label,
        passed: false,
        detail: `Expected exact content ${JSON.stringify(expectation.equals)}, got ${JSON.stringify(content)}.`
      };
    }

    if (expectation.includes !== undefined && !content.includes(expectation.includes)) {
      return {
        label,
        passed: false,
        detail: `Expected content to include ${JSON.stringify(expectation.includes)}.`
      };
    }

    return { label, passed: true };
  } catch (error) {
    return {
      label,
      passed: false,
      detail: error instanceof Error ? error.message : String(error)
    };
  }
}

async function evaluateCommandExpectation(workspace: string, expectation: EvalCommandExpectation): Promise<EvalAssertionResult> {
  const result = await runShellCommand(workspace, expectation.command);
  const label = `command ${expectation.command}`;

  if (result.exitCode !== expectation.exitCode) {
    return {
      label,
      passed: false,
      detail: `Expected exit ${expectation.exitCode}, got ${result.exitCode}. Output: ${clipOutput(result.output)}`
    };
  }

  if (expectation.stdoutEquals !== undefined && result.stdout !== expectation.stdoutEquals) {
    return {
      label,
      passed: false,
      detail: `Expected exact stdout ${JSON.stringify(expectation.stdoutEquals)}, got ${JSON.stringify(result.stdout)}. Stderr: ${clipOutput(result.stderr)}`
    };
  }

  if (expectation.stdoutIncludes !== undefined && !result.stdout.includes(expectation.stdoutIncludes)) {
    return {
      label,
      passed: false,
      detail: `Expected stdout to include ${JSON.stringify(expectation.stdoutIncludes)}. Output: ${clipOutput(result.stdout)}`
    };
  }

  return { label, passed: true };
}

async function runShellCommand(cwd: string, command: string) {
  return await new Promise<{ exitCode: number; stdout: string; stderr: string; output: string }>((resolve) => {
    const child = spawn(process.env.SHELL || "/bin/sh", ["-lc", command], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      stderr += error.message;
      resolve({ exitCode: 1, stdout, stderr, output: `${stdout}${stderr}` });
    });
    child.on("close", (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr, output: `${stdout}${stderr}` });
    });
  });
}

function resolveSafeWorkspacePath(workspace: string, path: string) {
  if (!isSafeRelativePath(path)) {
    throw new Error(`Unsafe workspace path: ${path}`);
  }

  const target = resolve(workspace, path);
  const relativePath = relative(workspace, target);

  if (relativePath.startsWith(`..${sep}`) || relativePath === ".." || relativePath === "") {
    throw new Error(`Path escapes workspace: ${path}`);
  }

  return target;
}

function isSafeRelativePath(path: string) {
  return Boolean(path)
    && !path.startsWith("/")
    && !path.split(/[\\/]/).includes("..");
}

function clipOutput(output: string) {
  const normalized = output.trim().replace(/\s+/g, " ");
  return normalized.length > 240 ? `${normalized.slice(0, 237)}...` : normalized;
}
