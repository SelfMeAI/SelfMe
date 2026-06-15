export type BuiltInCommandName = "help" | "tools";

export interface CommandPaletteItem {
  key: string;
  command: string;
  summary: string;
  requiresInput?: boolean;
}

const commandPaletteItems: CommandPaletteItem[] = [
  { key: "help", command: "/help", summary: "Show the minimal command reference" },
  { key: "tools", command: "/tools", summary: "List available tools" },
  { key: "read", command: "/read ", summary: "Read a file or line range", requiresInput: true },
  { key: "shell", command: "/shell ", summary: "Run a shell command", requiresInput: true }
];

export interface ParsedToolCommand {
  toolName: "shell" | "files";
  input: {
    command?: string;
    path?: string;
    startLine?: number;
    endLine?: number;
    maxBytes?: number;
  };
}

export function listCommandPaletteItems() {
  return commandPaletteItems.map((item) => ({ ...item }));
}

export function renderHelpLines() {
  return [
    "/help",
    "/tools",
    "/read <path>",
    "/read <path:start-end>",
    "/read <path> --max-bytes <n>",
    "/shell <command>"
  ];
}

export function parseBuiltInCommand(content: string): BuiltInCommandName | undefined {
  const trimmed = content.trim();

  if (trimmed === "/help") {
    return "help";
  }

  if (trimmed === "/tools") {
    return "tools";
  }

  return undefined;
}

export function parseToolCommand(content: string): ParsedToolCommand | undefined {
  const trimmed = content.trim();
  const commandMatch = trimmed.match(/^\/(shell|read)\s+([\s\S]+)$/);

  if (!commandMatch) {
    return undefined;
  }

  const [, command, rawInput] = commandMatch;

  if (command === "read") {
    return {
      toolName: "files",
      input: parseReadInput(rawInput.trim())
    };
  }

  return {
    toolName: "shell",
    input: {
      command: rawInput.trim()
    }
  };
}

function parseReadInput(rawInput: string) {
  const maxBytesMatch = rawInput.match(/\s+--max-bytes\s+(\d+)\s*$/);
  const maxBytes = maxBytesMatch ? Number(maxBytesMatch[1]) : undefined;
  const withoutMaxBytes = maxBytesMatch
    ? rawInput.slice(0, maxBytesMatch.index).trim()
    : rawInput;
  const rangeMatch = withoutMaxBytes.match(/:(\d+)(?:-(\d+))?$/);

  if (!rangeMatch) {
    return {
      path: withoutMaxBytes,
      maxBytes
    };
  }

  const path = withoutMaxBytes.slice(0, rangeMatch.index).trim();
  const startLine = Number(rangeMatch[1]);
  const endLine = rangeMatch[2] ? Number(rangeMatch[2]) : startLine;

  return {
    path,
    startLine,
    endLine,
    maxBytes
  };
}
