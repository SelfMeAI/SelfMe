import type { ToolDefinition } from "@selfme/protocol";

// 这里只做注册表骨架，Phase 1 再接入真实执行能力。
export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  public register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  public list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }
}
