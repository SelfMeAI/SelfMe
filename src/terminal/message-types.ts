export interface TerminalMessageBlock {
  kind?: "welcome" | "user" | "assistant" | "assistant-working" | "system" | "tool" | "approval" | "error";
  title: string;
  body: string;
  taskId?: string;
  approvalId?: string;
  approvalContext?: {
    toolName: string;
    reason: string;
    risk: string;
  };
  actions?: Array<{
    id: string;
    label: string;
    command: string;
    style?: "primary" | "secondary" | "danger";
  }>;
}
