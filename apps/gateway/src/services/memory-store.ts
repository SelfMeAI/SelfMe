import type { ChatMessage } from "@selfme/protocol";

function createMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export class MemoryStore {
  private readonly messages: ChatMessage[] = [];

  public append(role: ChatMessage["role"], content: string): ChatMessage {
    const message: ChatMessage = {
      id: createMessageId(),
      role,
      content,
      createdAt: new Date().toISOString()
    };

    this.messages.push(message);
    return message;
  }

  public list(): ChatMessage[] {
    return [...this.messages];
  }

  public clear(): void {
    this.messages.length = 0;
  }
}
