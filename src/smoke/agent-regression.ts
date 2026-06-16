import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { EventBus } from "../app/event-bus.js";
import type { ProviderClient, ProviderStreamChunk, ProviderStreamInput } from "../providers/base.js";
import { AgentRuntime } from "../runtime/agent.js";
import { createDefaultSessionRecord } from "../runtime/context.js";
import { buildContextMessages } from "../runtime/context-compaction.js";
import {
  createAssistantCompletedEvent,
  createAssistantDeltaEvent,
  createTerminalCommandInvokedEvent,
  createToolExecutionCompletedEvent,
  createUserMessageSubmittedEvent
} from "../runtime/events.js";
import { LogStore } from "../storage/logs.js";
import { TranscriptStore } from "../storage/transcripts.js";
import { InMemoryToolRegistry } from "../tools/registry.js";
import type { RuntimeEvent, TaskStateChangedEvent } from "../types/events.js";

const VERSION = "2026.6.16";

class RegressionProvider implements ProviderClient {
  readonly name = "regression-provider";

  async *streamResponse(input: ProviderStreamInput): AsyncIterable<ProviderStreamChunk> {
    const output = resolveProviderResponse(input.content);

    for (const delta of chunkText(output, output.startsWith("<tool_call>") ? 400 : 24)) {
      yield { delta };
    }
  }
}

async function main() {
  const root = await mkdtemp(join(tmpdir(), "selfme-agent-regression-"));
  const workspace = join(root, "workspace");
  const transcriptPath = join(root, "transcript.jsonl");
  const logsPath = join(root, "logs.jsonl");
  await mkdir(workspace, { recursive: true });

  const bus = new EventBus();
  const transcriptStore = new TranscriptStore(transcriptPath);
  const logStore = new LogStore(logsPath);
  await transcriptStore.ensureInitialized();
  await logStore.ensureInitialized();

  const session = createDefaultSessionRecord(workspace, VERSION);
  session.model = "regression-stub";

  const runtime = new AgentRuntime({
    bus,
    provider: new RegressionProvider(),
    tools: new InMemoryToolRegistry(),
    session,
    transcriptStore,
    logStore
  });
  await runtime.start();

  const approvals: string[] = [];
  bus.on("approval.requested", (event) => {
    approvals.push(event.payload.approvalId);
    bus.emit(createTerminalCommandInvokedEvent({
      sessionId: event.sessionId,
      content: `/approve ${event.payload.approvalId}`
    }));
  });

  await writeFile(join(workspace, "greet.mjs"), 'console.log("Hello");\n', "utf8");

  console.log("task: fix greet.mjs");
  const codingResult = await runAgentTask({
    bus,
    transcriptStore,
    sessionId: session.sessionId,
    prompt: 'Fix greet.mjs so it prints "Hello, SelfMe!" and verify by running it.'
  });

  const greetContent = await readFile(join(workspace, "greet.mjs"), "utf8");
  assert.equal(greetContent, 'console.log("Hello, SelfMe!");\n');
  assert.match(codingResult.assistantText, /Hello, SelfMe!/);
  assert.ok(
    codingResult.toolSummaries.some((summary) => summary.startsWith("node greet.mjs · completed")),
    "expected shell verification summary"
  );

  console.log("task: create checklist.md");
  const checklistResult = await runAgentTask({
    bus,
    transcriptStore,
    sessionId: session.sessionId,
    prompt: "Create checklist.md with exactly three bullet points: buy milk, ship cli, test tools. Then verify the file."
  });

  const checklistContent = await readFile(join(workspace, "checklist.md"), "utf8");
  assert.equal(checklistContent, "- buy milk\n- ship cli\n- test tools\n");
  assert.match(checklistResult.assistantText, /checklist\.md/i);
  assert.ok(
    checklistResult.toolSummaries.some((summary) => summary.startsWith("checklist.md:1-3")),
    "expected file verification summary"
  );

  console.log("task: handle missing file failure");
  const missingFileResult = await runAgentTask({
    bus,
    transcriptStore,
    sessionId: session.sessionId,
    prompt: "Check whether missing.txt exists and answer briefly."
  });

  assert.match(missingFileResult.assistantText, /missing\.txt/i);
  assert.match(missingFileResult.assistantText, /(does not exist|not exist|missing)/i);

  assert.ok(approvals.length >= 2, "expected at least two approvals to be auto-approved");

  console.log("task: verify context compaction");
  verifyContextCompaction();

  console.log("agent regression passed");
  console.log(`workspace: ${workspace}`);
  console.log(`approvals auto-approved: ${approvals.length}`);
}

async function runAgentTask(input: {
  bus: EventBus;
  transcriptStore: TranscriptStore;
  sessionId: string;
  prompt: string;
}) {
  const beforeEvents = await input.transcriptStore.readEventsBySession(input.sessionId);
  const completedTask = waitForAssistantTaskCompletion(input.bus, input.sessionId);
  input.bus.emit(createUserMessageSubmittedEvent({
    sessionId: input.sessionId,
    content: input.prompt
  }));

  const task = await completedTask;
  assert.equal(task.payload.state, "completed", `agent task did not complete: ${task.payload.state}`);

  const events = (await input.transcriptStore.readEventsBySession(input.sessionId)).slice(beforeEvents.length);
  const assistantText = collectAssistantText(events, task.taskId ?? "");
  const toolSummaries = events
    .filter((event): event is Extract<RuntimeEvent, { type: "tool.execution.completed" }> =>
      event.type === "tool.execution.completed" && event.taskId !== task.taskId
    )
    .map((event) => event.payload.summary);

  return {
    taskId: task.taskId ?? "",
    assistantText,
    toolSummaries
  };
}

function waitForAssistantTaskCompletion(bus: EventBus, sessionId: string) {
  return new Promise<TaskStateChangedEvent>((resolve) => {
    const off = bus.on("task.state.changed", (event) => {
      if (event.sessionId !== sessionId || event.payload.title !== "Respond to user input") {
        return;
      }

      if (event.payload.state === "completed" || event.payload.state === "failed" || event.payload.state === "cancelled") {
        off();
        resolve(event);
      }
    });
  });
}

function collectAssistantText(events: RuntimeEvent[], taskId: string) {
  return events
    .filter((event): event is Extract<RuntimeEvent, { type: "assistant.delta.received" }> =>
      event.type === "assistant.delta.received" && event.taskId === taskId
    )
    .map((event) => event.payload.delta)
    .join("");
}

function verifyContextCompaction() {
  const sessionId = "compaction-session";
  const events: RuntimeEvent[] = [];

  for (let index = 1; index <= 5; index += 1) {
    const taskId = `older-${index}`;
    events.push(createUserMessageSubmittedEvent({
      sessionId,
      content: `Older request ${index}`
    }));
    events.push(createAssistantDeltaEvent({
      sessionId,
      taskId,
      delta: `Older answer ${index}`
    }));
    events.push(createAssistantCompletedEvent({
      sessionId,
      taskId,
      model: "regression-stub"
    }));
  }

  events.push(createToolExecutionCompletedEvent({
    sessionId,
    taskId: "tool-older",
    toolName: "shell",
    summary: "yes · timed out · truncated",
    rawOutput: "Y".repeat(10_000)
  }));

  for (let index = 6; index <= 9; index += 1) {
    const taskId = `recent-${index}`;
    events.push(createUserMessageSubmittedEvent({
      sessionId,
      content: `Recent request ${index}`
    }));
    events.push(createAssistantDeltaEvent({
      sessionId,
      taskId,
      delta: `Recent answer ${index}`
    }));
    events.push(createAssistantCompletedEvent({
      sessionId,
      taskId,
      model: "regression-stub"
    }));
  }

  events.push(createToolExecutionCompletedEvent({
    sessionId,
    taskId: "tool-recent",
    toolName: "files",
    summary: "checklist.md:1-3",
    rawOutput: "   1 | - buy milk\n   2 | - ship cli\n   3 | - test tools"
  }));

  const messages = buildContextMessages(events);
  const merged = messages.map((message) => `${message.role}: ${message.content}`).join("\n");
  const recentUsers = messages.filter((message) => message.role === "user").map((message) => message.content);
  const recentAssistants = messages.filter((message) => message.role === "assistant").map((message) => message.content);

  assert.ok(messages.some((message) => message.role === "system" && message.content.includes("Earlier session summary:")));
  assert.ok(messages.some((message) => message.role === "system" && message.content.includes("Recent session notes:")));
  assert.match(merged, /yes · timed out · truncated/);
  assert.match(merged, /checklist\.md:1-3/);
  assert.doesNotMatch(merged, /Y{100}/);
  assert.deepEqual(recentUsers, ["Recent request 7", "Recent request 8", "Recent request 9"]);
  assert.deepEqual(recentAssistants, ["Recent answer 7", "Recent answer 8", "Recent answer 9"]);
}

function resolveProviderResponse(content: string) {
  if (content.startsWith('Fix greet.mjs so it prints "Hello, SelfMe!"')) {
    return toolCall("files", {
      path: "greet.mjs",
      startLine: 1,
      endLine: 20
    });
  }

  if (content.startsWith("Create checklist.md with exactly three bullet points")) {
    return toolCall("write", {
      path: "checklist.md",
      content: "- buy milk\n- ship cli\n- test tools\n"
    });
  }

  if (content.startsWith("Check whether missing.txt exists and answer briefly.")) {
    return toolCall("files", {
      path: "missing.txt",
      startLine: 1,
      endLine: 20
    });
  }

  if (content.startsWith("Original user request: Fix greet.mjs")) {
    const toolName = extractLine(content, "Tool:");

    if (toolName === "files") {
      assert.match(content, /console\.log\("Hello"\);/);
      return toolCall("edit", {
        path: "greet.mjs",
        startLine: 1,
        endLine: 1,
        replacement: 'console.log("Hello, SelfMe!");'
      });
    }

    if (toolName === "edit") {
      return toolCall("shell", {
        command: "node greet.mjs"
      });
    }

    if (toolName === "shell") {
      assert.match(content, /Hello, SelfMe!/);
      return "Fixed greet.mjs and verified it prints Hello, SelfMe!.";
    }
  }

  if (content.startsWith("Original user request: Create checklist.md")) {
    const toolName = extractLine(content, "Tool:");

    if (toolName === "write") {
      return toolCall("files", {
        path: "checklist.md",
        startLine: 1,
        endLine: 20
      });
    }

    if (toolName === "files") {
      assert.match(content, /- buy milk/);
      assert.match(content, /- ship cli/);
      assert.match(content, /- test tools/);
      return "Created checklist.md and verified the three requested items are present.";
    }
  }

  if (content.startsWith("Original user request: Check whether missing.txt exists")) {
    assert.match(content, /The latest tool attempt failed\./);
    assert.match(content, /ENOENT|no such file or directory/i);
    return "missing.txt does not exist in the current workspace.";
  }

  throw new Error(`Unhandled regression prompt:\n${content}`);
}

function toolCall(tool: string, input: Record<string, unknown>) {
  return `<tool_call>\n${JSON.stringify({ tool, input })}\n</tool_call>`;
}

function extractLine(content: string, prefix: string) {
  return content
    .split("\n")
    .find((line) => line.startsWith(prefix))
    ?.slice(prefix.length)
    .trim();
}

function chunkText(content: string, size: number) {
  const chunks: string[] = [];

  for (let index = 0; index < content.length; index += size) {
    chunks.push(content.slice(index, index + size));
  }

  return chunks;
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
