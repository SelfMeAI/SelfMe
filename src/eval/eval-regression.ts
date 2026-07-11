import assert from "node:assert/strict";

import type { ProviderClient, ProviderStreamChunk, ProviderStreamInput } from "../providers/base.js";

import { runEvalTask } from "./runner.js";
import { baselineEvalTasks } from "./suite.js";
import type { EvalTaskDefinition } from "./types.js";

class EvalRegressionProvider implements ProviderClient {
  readonly name = "eval-regression-provider";

  async *streamResponse(input: ProviderStreamInput): AsyncIterable<ProviderStreamChunk> {
    const task = baselineEvalTasks[0];

    if (input.content === task.prompt) {
      yield {
        delta: toolCall("files", {
          path: "greet.mjs",
          startLine: 1,
          endLine: 20
        })
      };
      return;
    }

    if (input.content.startsWith(`Original user request: ${task.prompt}`)) {
      const toolName = extractLine(input.content, "Tool:") ?? extractLine(input.content, "Latest tool:");
      const summary = extractLine(input.content, "Summary:") ?? extractLine(input.content, "Latest summary:") ?? "";

      if (toolName === "files" && summary.startsWith("greet.mjs:")) {
        yield {
          delta: toolCall("edit", {
            path: "greet.mjs",
            startLine: 1,
            endLine: 1,
            replacement: 'console.log("Hello, SelfMe!");'
          })
        };
        return;
      }

      if (toolName === "edit" && summary.startsWith("greet.mjs:")) {
        yield {
          delta: toolCall("shell", {
            command: "node greet.mjs"
          })
        };
        return;
      }

      if (toolName === "shell" && summary.startsWith("node greet.mjs · completed")) {
        yield { delta: "Verified greet.mjs now prints exactly Hello, SelfMe!." };
        return;
      }
    }

    throw new Error(`Unhandled eval regression prompt:\n${input.content}`);
  }
}

class ResumeEvalRegressionProvider implements ProviderClient {
  readonly name = "resume-eval-regression-provider";

  constructor(private readonly task: EvalTaskDefinition) {}

  async *streamResponse(input: ProviderStreamInput): AsyncIterable<ProviderStreamChunk> {
    if (input.content === this.task.prompt) {
      yield {
        delta: toolCall("files", {
          path: "greet.mjs",
          startLine: 1,
          endLine: 20
        })
      };
      return;
    }

    if (input.content.startsWith(`Original user request: ${this.task.prompt}`)) {
      const toolName = extractLine(input.content, "Tool:") ?? extractLine(input.content, "Latest tool:");
      const summary = extractLine(input.content, "Summary:") ?? extractLine(input.content, "Latest summary:") ?? "";

      if (toolName === "files" && summary.startsWith("greet.mjs:")) {
        yield {
          delta: toolCall("edit", {
            path: "greet.mjs",
            startLine: 1,
            endLine: 1,
            replacement: 'console.log("Hello, SelfMe!");'
          })
        };
        return;
      }
    }

    if (input.content.startsWith('The user replied "继续" and wants to continue the most recent unfinished task.')) {
      yield {
        delta: toolCall("shell", {
          command: "node greet.mjs"
        })
      };
      return;
    }

    if (input.content.startsWith('Original user request: The user replied "继续" and wants to continue the most recent unfinished task.')) {
      yield { delta: "Resumed the task and verified greet.mjs prints Hello, SelfMe!." };
      return;
    }

    throw new Error(`Unhandled resume eval regression prompt:\n${input.content}`);
  }
}

class ApprovalResumeEvalRegressionProvider implements ProviderClient {
  readonly name = "approval-resume-eval-regression-provider";

  constructor(private readonly task: EvalTaskDefinition) {}

  async *streamResponse(input: ProviderStreamInput): AsyncIterable<ProviderStreamChunk> {
    if (input.content === this.task.prompt) {
      yield {
        delta: toolCall("files", {
          path: "greet.mjs",
          startLine: 1,
          endLine: 20
        })
      };
      return;
    }

    if (input.content.startsWith(`Original user request: ${this.task.prompt}`)) {
      const toolName = extractLine(input.content, "Tool:") ?? extractLine(input.content, "Latest tool:");
      const summary = extractLine(input.content, "Summary:") ?? extractLine(input.content, "Latest summary:") ?? "";

      if (toolName === "files" && summary.startsWith("greet.mjs:")) {
        yield {
          delta: toolCall("edit", {
            path: "greet.mjs",
            startLine: 1,
            endLine: 1,
            replacement: 'console.log("Hello, SelfMe!");'
          })
        };
        return;
      }
    }

    if (input.content.startsWith('The user replied "继续" and wants to continue the most recent unfinished task.')) {
      yield {
        delta: toolCall("edit", {
          path: "greet.mjs",
          startLine: 1,
          endLine: 1,
          replacement: 'console.log("Hello, SelfMe!");'
        })
      };
      return;
    }

    if (input.content.startsWith('Original user request: The user replied "继续" and wants to continue the most recent unfinished task.')) {
      const toolName = extractLine(input.content, "Tool:") ?? extractLine(input.content, "Latest tool:");
      const summary = extractLine(input.content, "Summary:") ?? extractLine(input.content, "Latest summary:") ?? "";

      if (toolName === "edit" && summary.startsWith("greet.mjs:")) {
        yield {
          delta: toolCall("shell", {
            command: "node greet.mjs"
          })
        };
        return;
      }

      if (toolName === "shell" && summary.startsWith("node greet.mjs · completed")) {
        yield { delta: "Resumed after the pending approval and verified greet.mjs prints Hello, SelfMe!." };
        return;
      }
    }

    throw new Error(`Unhandled approval-resume eval regression prompt:\n${input.content}`);
  }
}

async function main() {
  const result = await runEvalTask({
    task: baselineEvalTasks[0],
    provider: new EvalRegressionProvider(),
    timeoutMs: 10_000
  });

  assert.equal(result.passed, true, JSON.stringify(result, null, 2));
  assert.equal(result.taskState, "completed");
  assert.equal(result.approvalCount, 1, "the evaluator should auto-approve the task-scoped edit");
  assert.ok(
    result.assertions.some((assertion) => assertion.label === "approval count" && assertion.passed),
    "the evaluator should assert the expected approval budget"
  );
  assert.match(result.assistantText, /Hello, SelfMe!/);
  assert.ok(
    result.toolSummaries.some((summary) => summary.startsWith("node greet.mjs · completed")),
    "the evaluator should collect executed verification results"
  );
  assert.deepEqual(
    result.toolCalls.map((call) => call.toolName),
    ["files", "edit", "shell"],
    "the evaluator should preserve tool names alongside display summaries"
  );
  assert.ok(
    result.assertions.some((assertion) => assertion.label === "required tool call shell" && assertion.passed),
    "the evaluator should enforce required tool-result coverage"
  );
  assert.ok(result.assertions.every((assertion) => assertion.passed));
  assert.deepEqual(result.qualityWarnings, []);

  const approvalBudgetFailureTask: EvalTaskDefinition = {
    ...baselineEvalTasks[0],
    id: "single-file-approval-budget-failure",
    expectations: {
      ...baselineEvalTasks[0].expectations,
      approvalCount: {
        max: 0
      }
    }
  };
  const approvalBudgetFailureResult = await runEvalTask({
    task: approvalBudgetFailureTask,
    provider: new EvalRegressionProvider(),
    timeoutMs: 10_000
  });

  assert.equal(approvalBudgetFailureResult.passed, false);
  assert.ok(
    approvalBudgetFailureResult.assertions.some((assertion) => (
      assertion.label === "approval count"
      && !assertion.passed
      && assertion.detail?.includes("Expected at most 0 approval(s), got 1.")
    )),
    "the evaluator should fail when a task exceeds its approval budget"
  );

  const missingToolCallTask: EvalTaskDefinition = {
    ...baselineEvalTasks[0],
    id: "single-file-missing-tool-call",
    expectations: {
      ...baselineEvalTasks[0].expectations,
      requiredToolCalls: [
        {
          toolName: "write"
        }
      ]
    }
  };
  const missingToolCallResult = await runEvalTask({
    task: missingToolCallTask,
    provider: new EvalRegressionProvider(),
    timeoutMs: 10_000
  });

  assert.equal(missingToolCallResult.passed, false);
  assert.ok(
    missingToolCallResult.assertions.some((assertion) => (
      assertion.label === "required tool call write"
      && !assertion.passed
    )),
    "the evaluator should fail when a required tool-result trace is missing"
  );

  const resumeTask: EvalTaskDefinition = {
    ...baselineEvalTasks[0],
    id: "single-file-resume",
    title: "Resume after an interrupted edit",
    interruption: {
      afterToolSummaryIncludes: "greet.mjs:1-1 · updated",
      followUp: "继续"
    }
  };
  const resumedResult = await runEvalTask({
    task: resumeTask,
    provider: new ResumeEvalRegressionProvider(resumeTask),
    timeoutMs: 10_000
  });

  assert.equal(resumedResult.passed, true, JSON.stringify(resumedResult, null, 2));
  assert.equal(resumedResult.resumed, true);
  assert.match(resumedResult.interruptionSummary ?? "", /greet\.mjs:1-1 · updated/);
  assert.ok(
    resumedResult.toolSummaries.some((summary) => summary.startsWith("node greet.mjs · completed")),
    "the resumed evaluator task should run its pending verification command"
  );

  const approvalResumeTask: EvalTaskDefinition = {
    ...baselineEvalTasks[0],
    id: "single-file-approval-resume",
    title: "Resume after an interrupted edit approval",
    interruption: {
      afterApprovalToolName: "edit",
      followUp: "继续"
    },
    expectations: {
      ...baselineEvalTasks[0].expectations,
      approvalCount: {
        min: 2,
        max: 2
      }
    }
  };
  const approvalResumedResult = await runEvalTask({
    task: approvalResumeTask,
    provider: new ApprovalResumeEvalRegressionProvider(approvalResumeTask),
    timeoutMs: 10_000
  });

  assert.equal(approvalResumedResult.passed, true, JSON.stringify(approvalResumedResult, null, 2));
  assert.equal(approvalResumedResult.resumed, true);
  assert.equal(approvalResumedResult.approvalCount, 2);
  assert.match(approvalResumedResult.interruptionSummary ?? "", /approval requested for edit/);
  assert.ok(
    approvalResumedResult.toolSummaries.some((summary) => summary.startsWith("node greet.mjs · completed")),
    "the approval-interrupted evaluator task should complete verification after resume"
  );
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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
