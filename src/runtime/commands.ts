export type BuiltInCommandName = "help" | "stop";

export interface CommandPaletteItem {
  key: string;
  command: string;
  display: string;
  summary: string;
  requiresInput?: boolean;
}

const commandPaletteItems: CommandPaletteItem[] = [
  { key: "help", command: "/help", display: "/help", summary: "Show help" },
  { key: "stop", command: "/stop", display: "/stop", summary: "Stop current task" },
  { key: "read", command: "/read ", display: "/read <path>", summary: "Read file", requiresInput: true },
  { key: "write", command: "/write ", display: "/write <path>", summary: "Write file", requiresInput: true },
  { key: "edit", command: "/edit ", display: "/edit <path>", summary: "Edit file", requiresInput: true },
  { key: "shell", command: "/shell ", display: "/shell <command>", summary: "Run command", requiresInput: true }
];

export interface ParsedToolCommand {
  toolName: "shell" | "files" | "write" | "edit";
  input: {
    command?: string;
    path?: string;
    startLine?: number;
    endLine?: number;
    maxBytes?: number;
    content?: string;
    replacement?: string;
  };
}

export function listCommandPaletteItems() {
  return commandPaletteItems.map((item) => ({ ...item }));
}

export function renderHelpLines() {
  return [
    "Commands",
    "/help",
    "/stop",
    "/read <path>",
    "/write <path>",
    "/edit <path>",
    "/shell <command>",
    "",
    "Input",
    "Type / to open commands",
    "Use ↑↓ to select",
    "Press Enter to confirm",
    "",
    "Notes",
    "For /write and /edit, content starts on the next line",
    "Esc stops the current response"
  ];
}

export function parseBuiltInCommand(content: string): BuiltInCommandName | undefined {
  const trimmed = content.trim();

  if (trimmed === "/help") {
    return "help";
  }

  if (trimmed === "/stop") {
    return "stop";
  }

  return undefined;
}

export function parseToolCommand(content: string): ParsedToolCommand | undefined {
  const normalized = content.replace(/\r\n/g, "\n");
  const newlineIndex = normalized.indexOf("\n");
  const header = newlineIndex >= 0 ? normalized.slice(0, newlineIndex) : normalized;
  const body = newlineIndex >= 0 ? normalized.slice(newlineIndex + 1) : "";
  const trimmedHeader = header.trim();

  if (trimmedHeader.startsWith("/write ")) {
    const path = trimmedHeader.slice("/write ".length).trim();

    if (!path) {
      return undefined;
    }

    return {
      toolName: "write",
      input: {
        path,
        content: body
      }
    };
  }

  if (trimmedHeader.startsWith("/edit ")) {
    const target = trimmedHeader.slice("/edit ".length).trim();

    if (!target) {
      return undefined;
    }

    return {
      toolName: "edit",
      input: {
        ...parsePathRangeInput(target),
        replacement: body
      }
    };
  }

  const trimmed = normalized.trim();
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

  return {
    ...parsePathRangeInput(withoutMaxBytes),
    maxBytes
  };
}

function parsePathRangeInput(rawInput: string) {
  const rangeMatch = rawInput.match(/:(\d+)(?:-(\d+))?$/);

  if (!rangeMatch) {
    return {
      path: rawInput
    };
  }

  const path = rawInput.slice(0, rangeMatch.index).trim();
  const startLine = Number(rangeMatch[1]);
  const endLine = rangeMatch[2] ? Number(rangeMatch[2]) : startLine;

  return {
    path,
    startLine,
    endLine
  };
}
