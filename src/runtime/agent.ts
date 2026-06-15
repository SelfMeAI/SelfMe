import { randomUUID } from "node:crypto";

import type { EventBus } from "../app/event-bus.js";
import type { ProviderClient } from "../providers/base.js";
import type { LogStore } from "../storage/logs.js";
import type { TranscriptStore } from "../storage/transcripts.js";
import type { ToolRegistry } from "../tools/base.js";
import type { ApprovalRequest } from "../types/approval.js";
import type { SessionRecord } from "../types/session.js";
import { parseBuiltInCommand, parseToolCommand, renderHelpLines } from "./commands.js";
import { buildContextMessages, createInlinePreview } from "./context-compaction.js";
import {
  createApprovalRequestedEvent,
  createApprovalResolvedEvent,
  createAssistantCompletedEvent,
  createAssistantDeltaEvent,
  createAssistantStartedEvent,
  createRuntimeErrorRaisedEvent,
  createSystemMessageAppendedEvent,
  createTaskStateChangedEvent,
  createToolExecutionCompletedEvent,
  createToolExecutionRequestedEvent,
  createToolExecutionStartedEvent,
  createToolStdoutAppendedEvent
} from "./events.js";

export class AgentRuntime {
  private readonly pendingApprovals = new Map<string, {
    request: ApprovalRequest;
    toolName: string;
    input: unknown;
  }>();

  constructor(
    private readonly input: {
      bus: EventBus;
      provider: ProviderClient;
      tools: ToolRegistry;
      session: SessionRecord;
      transcriptStore: TranscriptStore;
      logStore: LogStore;
    }
  ) {}

  async start() {
    this.input.bus.on("user.message.submitted", async (event) => {
      const handled = await this.handleCommandContent(event.sessionId, event.payload.content, true);

      if (handled) {
        return;
      }

      await this.input.transcriptStore.appendEvent(event);
      await this.handleAssistantTurn(event.sessionId, event.payload.content);
    });

    this.input.bus.on("terminal.command.invoked", async (event) => {
      await this.handleCommandContent(event.sessionId, event.payload.content, false);
    });

    this.input.bus.on("approval.resolved", async (event) => {
      if (!event.payload.approved) {
        const taskState = createTaskStateChangedEvent({
          sessionId: event.sessionId,
          taskId: event.taskId ?? randomUUID(),
          state: "cancelled",
          title: "Approval denied"
        });
        this.input.bus.emit(taskState);
        await this.input.transcriptStore.appendEvent(taskState);
      }
    });

    this.input.bus.on("tool.execution.requested", async (event) => {
      if (event.taskId) {
        this.input.bus.emit(createTaskStateChangedEvent({
          sessionId: event.sessionId,
          taskId: event.taskId,
          state: "running",
          title: `Run ${event.payload.toolName}`
        }));
      }

      const tool = this.input.tools.get(event.payload.toolName);

      if (!tool) {
        const runtimeError = createRuntimeErrorRaisedEvent({
          sessionId: event.sessionId,
          taskId: event.taskId,
          message: `Unknown tool: ${event.payload.toolName}`
        });
        this.input.bus.emit(runtimeError);
        await this.input.transcriptStore.appendEvent(runtimeError);
        return;
      }

      const started = createToolExecutionStartedEvent({
        sessionId: event.sessionId,
        taskId: event.taskId,
        toolName: event.payload.toolName
      });
      this.input.bus.emit(started);
      await this.input.transcriptStore.appendEvent(started);

      try {
        const result = await tool.invoke(event.payload.input, {
          cwd: this.input.session.cwd ?? process.cwd(),
          sessionId: event.sessionId,
          taskId: event.taskId,
          onStdoutChunk: async (chunk) => {
            const stdoutEvent = createToolStdoutAppendedEvent({
              sessionId: event.sessionId,
              taskId: event.taskId,
              toolName: event.payload.toolName,
              chunk
            });
            this.input.bus.emit(stdoutEvent);
            await this.input.transcriptStore.appendEvent(stdoutEvent);
          }
        });

        if (result.summary) {
          await this.input.logStore.append({
            sessionId: event.sessionId,
            taskId: event.taskId,
            toolName: event.payload.toolName,
            kind: "summary",
            content: result.summary
          });
        }

        if (result.rawLogs?.stdout) {
          await this.input.logStore.append({
            sessionId: event.sessionId,
            taskId: event.taskId,
            toolName: event.payload.toolName,
            kind: "stdout",
            content: result.rawLogs.stdout
          });
        }

        if (result.rawLogs?.stderr) {
          await this.input.logStore.append({
            sessionId: event.sessionId,
            taskId: event.taskId,
            toolName: event.payload.toolName,
            kind: "stderr",
            content: result.rawLogs.stderr
          });
        }

        const completed = createToolExecutionCompletedEvent({
          sessionId: event.sessionId,
          taskId: event.taskId,
          toolName: event.payload.toolName,
          summary: result.summary,
          rawOutput: result.rawLogs?.stdout || result.rawLogs?.stderr
        });
        this.input.bus.emit(completed);
        await this.input.transcriptStore.appendEvent(completed);

        if (event.taskId) {
          const taskCompleted = createTaskStateChangedEvent({
            sessionId: event.sessionId,
            taskId: event.taskId,
            state: result.ok ? "completed" : "failed",
            title: `Run ${event.payload.toolName}`
          });
          this.input.bus.emit(taskCompleted);
          await this.input.transcriptStore.appendEvent(taskCompleted);
        }
      } catch (error) {
        const runtimeError = createRuntimeErrorRaisedEvent({
          sessionId: event.sessionId,
          taskId: event.taskId,
          message: error instanceof Error ? error.message : "Tool execution failed"
        });
        this.input.bus.emit(runtimeError);
        await this.input.transcriptStore.appendEvent(runtimeError);

        if (event.taskId) {
          const taskFailed = createTaskStateChangedEvent({
            sessionId: event.sessionId,
            taskId: event.taskId,
            state: "failed",
            title: `Run ${event.payload.toolName}`
          });
          this.input.bus.emit(taskFailed);
          await this.input.transcriptStore.appendEvent(taskFailed);
        }
      }
    });
  }

  private async handleCommandContent(sessionId: string, content: string, persistUserMessage: boolean) {
    const approvalMatch = content.trim().match(/^\/(approve|deny)\s+([a-f0-9-]+)$/i);

    if (approvalMatch) {
      const [, action, approvalId] = approvalMatch;
      const pending = this.pendingApprovals.get(approvalId);

      if (!pending) {
        const runtimeError = createRuntimeErrorRaisedEvent({
          sessionId,
          message: `Unknown approval id: ${approvalId}`
        });
        this.input.bus.emit(runtimeError);
        return true;
      }

      const resolved = createApprovalResolvedEvent({
        sessionId,
        taskId: pending.request.taskId,
        approvalId,
        approved: action === "approve"
      });
      this.input.bus.emit(resolved);
      await this.input.transcriptStore.appendEvent(resolved);

      this.pendingApprovals.delete(approvalId);

      if (action === "approve") {
        const toolEvent = createToolExecutionRequestedEvent({
          sessionId,
          taskId: pending.request.taskId,
          toolName: pending.toolName,
          input: pending.input
        });
        this.input.bus.emit(toolEvent);
        await this.input.transcriptStore.appendEvent(toolEvent);
      }

      return true;
    }

    if (!persistUserMessage) {
      if (content.trim().startsWith("/")) {
        await this.processCommandOnlyInput({
          sessionId,
          content
        });
        return true;
      }
    }

    return false;
  }

  private async processCommandOnlyInput(input: {
    sessionId: string;
    content: string;
  }) {
    const parsedToolCommand = parseToolCommand(input.content);

    if (parsedToolCommand) {
      const taskId = randomUUID();
      const { toolName, input: toolInput } = parsedToolCommand;

      if (toolName === "shell") {
        const waitingApprovalTask = createTaskStateChangedEvent({
          sessionId: input.sessionId,
          taskId,
          state: "waiting_approval",
          title: `Run shell · ${createInlinePreview(toolInput.command ?? "", 96)}`
        });
        const approval = createApprovalRequestedEvent({
          sessionId: input.sessionId,
          taskId,
          toolName,
          input: toolInput,
          reason: `Run shell command: ${toolInput.command ?? ""}`,
          risk: "high"
        });

        this.pendingApprovals.set(approval.payload.approvalId, {
          request: approval.payload,
          toolName,
          input: toolInput
        });

        this.input.bus.emit(waitingApprovalTask);
        this.input.bus.emit(approval);
        await this.input.transcriptStore.appendEvent(waitingApprovalTask);
        await this.input.transcriptStore.appendEvent(approval);
        return true;
      }

      const toolEvent = createToolExecutionRequestedEvent({
        sessionId: input.sessionId,
        taskId,
        toolName,
        input: toolInput
      });

      this.input.bus.emit(toolEvent);
      await this.input.transcriptStore.appendEvent(toolEvent);
      return true;
    }

    const builtInCommand = parseBuiltInCommand(input.content);

    if (builtInCommand === "help") {
      const helpEvent = createSystemMessageAppendedEvent({
        sessionId: input.sessionId,
        title: "Help",
        content: renderHelpLines().join("\n")
      });
      this.input.bus.emit(helpEvent);
      return true;
    }

    if (builtInCommand === "tools") {
      const toolsEvent = createSystemMessageAppendedEvent({
        sessionId: input.sessionId,
        title: "Tools",
        content: this.input.tools.list()
          .map((tool) => `${tool.name}  ${tool.description}  [approval: ${tool.approvalPolicy}]`)
          .join("\n")
      });
      this.input.bus.emit(toolsEvent);
      return true;
    }

    const runtimeError = createRuntimeErrorRaisedEvent({
      sessionId: input.sessionId,
      message: `Unknown command: ${input.content.trim()}`
    });
    this.input.bus.emit(runtimeError);
    return true;
  }

  private async handleAssistantTurn(sessionId: string, content: string) {
    const taskId = randomUUID();

    this.input.bus.emit(createTaskStateChangedEvent({
      sessionId,
      taskId,
      state: "running",
      title: "Respond to user input"
    }));

    this.input.bus.emit(createAssistantStartedEvent({
      sessionId,
      taskId
    }));

    try {
      const historyEvents = await this.input.transcriptStore.readEventsBySession(sessionId);
      const contextMessages = buildContextMessages(historyEvents);

      for await (const delta of this.input.provider.streamResponse({
        content,
        contextMessages
      })) {
        const nextEvent = createAssistantDeltaEvent({
          sessionId,
          taskId,
          delta: delta.delta
        });
        this.input.bus.emit(nextEvent);
        await this.input.transcriptStore.appendEvent(nextEvent);
      }

      const completedEvent = createAssistantCompletedEvent({
        sessionId,
        taskId,
        model: this.input.session.model
      });
      this.input.bus.emit(completedEvent);
      await this.input.transcriptStore.appendEvent(completedEvent);

      const taskCompleted = createTaskStateChangedEvent({
        sessionId,
        taskId,
        state: "completed",
        title: "Respond to user input"
      });
      this.input.bus.emit(taskCompleted);
      await this.input.transcriptStore.appendEvent(taskCompleted);
    } catch (error) {
      const runtimeError = createRuntimeErrorRaisedEvent({
        sessionId,
        taskId,
        message: error instanceof Error ? error.message : "Unknown runtime error"
      });
      this.input.bus.emit(runtimeError);
      await this.input.transcriptStore.appendEvent(runtimeError);

      const taskFailed = createTaskStateChangedEvent({
        sessionId,
        taskId,
        state: "failed",
        title: "Respond to user input"
      });
      this.input.bus.emit(taskFailed);
      await this.input.transcriptStore.appendEvent(taskFailed);
    }
  }
}
