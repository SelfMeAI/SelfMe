import type { AgentRuntime } from "../runtime/agent.js";
import type { TranscriptStore } from "../storage/transcripts.js";
import type { TerminalRenderer } from "../terminal/renderer.js";
import type { TerminalEventLoop } from "../terminal/event-loop.js";

export class AppLifecycle {
  constructor(
    private readonly input: {
      runtime: AgentRuntime;
      renderer: TerminalRenderer;
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
