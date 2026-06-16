import type { AgentRuntime } from "../runtime/agent.js";
import type { TranscriptStore } from "../storage/transcripts.js";
import type { TerminalEventLoop } from "../terminal/event-loop.js";

export class AppLifecycle {
  constructor(
    private readonly input: {
      runtime: AgentRuntime;
      renderer: {
        start(): Promise<void>;
      };
      terminal: TerminalEventLoop;
      transcriptStore: TranscriptStore;
    }
  ) {}

  async start() {
    await this.input.transcriptStore.ensureInitialized();
    await this.input.renderer.start();
    await this.input.runtime.start();
    this.input.terminal.start();
  }
}
