import { access, appendFile, writeFile } from "node:fs/promises";

export class LogStore {
  constructor(private readonly filePath: string) {}

  async ensureInitialized() {
    try {
      await access(this.filePath);
    } catch {
      await writeFile(this.filePath, "");
    }
  }

  async append(entry: {
    sessionId: string;
    taskId?: string;
    toolName: string;
    kind: "stdout" | "stderr" | "summary";
    content: string;
    createdAt?: string;
  }) {
    await appendFile(this.filePath, `${JSON.stringify({
      ...entry,
      createdAt: entry.createdAt ?? new Date().toISOString()
    })}\n`);
  }
}
