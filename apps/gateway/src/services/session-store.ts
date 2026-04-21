import { randomUUID } from "node:crypto";

import type { ClientType, SessionSummary } from "@selfme/protocol";

import { MemoryStore } from "./memory-store.js";

export interface SessionRecord {
  summary: SessionSummary;
  memory: MemoryStore;
}

function createSessionId(): string {
  return randomUUID();
}

export class SessionStore {
  private readonly sessions = new Map<string, SessionRecord>();

  public createOrGet(input?: {
    sessionId?: string;
    clientType?: ClientType;
    metadata?: Record<string, unknown>;
  }): SessionRecord {
    const sessionId = input?.sessionId ?? createSessionId();
    const existing = this.sessions.get(sessionId);

    if (existing) {
      existing.summary.updatedAt = new Date().toISOString();
      return existing;
    }

    const now = new Date().toISOString();
    const record: SessionRecord = {
      summary: {
        sessionId,
        clientType: input?.clientType ?? "unknown",
        createdAt: now,
        updatedAt: now,
        messageCount: 0,
        metadata: input?.metadata ?? {}
      },
      memory: new MemoryStore()
    };

    this.sessions.set(sessionId, record);
    return record;
  }

  public get(sessionId: string): SessionRecord | undefined {
    const record = this.sessions.get(sessionId);

    if (record) {
      record.summary.updatedAt = new Date().toISOString();
      record.summary.messageCount = record.memory.list().length;
    }

    return record;
  }

  public listSize(): number {
    return this.sessions.size;
  }

  public clearMessages(sessionId: string): SessionRecord | undefined {
    const record = this.sessions.get(sessionId);

    if (record) {
      record.memory.clear();
      record.summary.messageCount = 0;
      record.summary.updatedAt = new Date().toISOString();
    }

    return record;
  }
}
