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

export function parseToolCommand(content: string): ParsedToolCommand | undefined {
  const trimmed = content.trim();
  const commandMatch = trimmed.match(/^\/(shell|read)\s+([\s\S]+)$/);

  if (!commandMatch) {
    return undefined;
  }

  const [, command, rawInput] = commandMatch;

  if (command === "read") {
    const parsedReadInput = parseReadInput(rawInput.trim());

    return {
      toolName: "files",
      input: parsedReadInput
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
