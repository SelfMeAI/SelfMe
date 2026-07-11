export interface EvalFileExpectation {
  path: string;
  equals?: string;
  includes?: string;
}

export interface EvalCommandExpectation {
  command: string;
  exitCode: number;
  stdoutEquals?: string;
  stdoutIncludes?: string;
}

export interface EvalApprovalCountExpectation {
  min?: number;
  max?: number;
}

export interface EvalRequiredToolCallExpectation {
  toolName?: string;
  summaryIncludes?: string;
}

export interface EvalTaskDefinition {
  id: string;
  title: string;
  prompt: string;
  fixture: Record<string, string>;
  interruption?: {
    afterToolSummaryIncludes?: string;
    afterApprovalToolName?: string;
    followUp: string;
  };
  quality?: {
    recommendedMaxToolCalls?: number;
  };
  expectations: {
    files?: EvalFileExpectation[];
    commands?: EvalCommandExpectation[];
    approvalCount?: EvalApprovalCountExpectation;
    requiredToolCalls?: EvalRequiredToolCallExpectation[];
    assistantIncludesAny?: string[];
  };
}

export interface EvalAssertionResult {
  label: string;
  passed: boolean;
  detail?: string;
}

export interface EvalToolCallResult {
  toolName: string;
  summary: string;
}

export interface EvalTaskResult {
  id: string;
  title: string;
  passed: boolean;
  taskState: "completed" | "failed" | "cancelled" | "timed_out";
  durationMs: number;
  approvalCount: number;
  resumed: boolean;
  interruptionSummary?: string;
  assistantText: string;
  toolSummaries: string[];
  toolCalls: EvalToolCallResult[];
  runtimeErrors: string[];
  assertions: EvalAssertionResult[];
  qualityWarnings: string[];
}

export interface EvalSuiteResult {
  startedAt: string;
  finishedAt: string;
  provider: string;
  passed: boolean;
  tasks: EvalTaskResult[];
}
