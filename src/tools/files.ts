import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

import { z } from "zod";

import type { ToolImplementation, ToolResult } from "../types/tool.js";

export const fileToolSchema = z.object({
  path: z.string().min(1),
  startLine: z.number().int().min(1).optional(),
  endLine: z.number().int().min(1).optional(),
  maxBytes: z.number().int().min(256).max(65536).optional()
});

export const writeFileToolSchema = z.object({
  path: z.string().min(1),
  content: z.string()
});

export const editFileToolSchema = z.object({
  path: z.string().min(1),
  startLine: z.number().int().min(1).optional(),
  endLine: z.number().int().min(1).optional(),
  replacement: z.string()
});

export type FileToolInput = z.infer<typeof fileToolSchema>;
export type WriteFileToolInput = z.infer<typeof writeFileToolSchema>;
export type EditFileToolInput = z.infer<typeof editFileToolSchema>;

export const fileTool: ToolImplementation<FileToolInput> = {
  name: "files",
  description: "Read or inspect workspace files",
  inputSchema: fileToolSchema,
  approvalPolicy: "never",
  async invoke(input, context): Promise<ToolResult> {
    const target = resolveWorkspacePath(context.cwd, input.path);
    const fileStat = await stat(target);
    const content = await readFile(target, "utf8");
    const allLines = normalizeLines(content);
    const startLine = input.startLine ?? 1;
    const endLine = input.endLine ?? allLines.length;
    const safeStartLine = Math.max(1, Math.min(startLine, allLines.length || 1));
    const safeEndLine = Math.max(safeStartLine, Math.min(endLine, allLines.length || safeStartLine));
    const sliced = allLines.slice(safeStartLine - 1, safeEndLine);
    const numbered = sliced
      .map((line, index) => `${String(safeStartLine + index).padStart(4, " ")} | ${line}`)
      .join("\n");
    const maxBytes = input.maxBytes ?? 12000;
    const clipped = clipText(numbered, maxBytes);

    return {
      ok: true,
      summary: buildReadSummary({
        path: input.path,
        startLine: safeStartLine,
        endLine: safeEndLine,
        truncated: clipped.truncated
      }),
      structuredOutput: {
        path: input.path,
        sizeBytes: fileStat.size,
        totalLines: allLines.length,
        startLine: safeStartLine,
        endLine: safeEndLine,
        truncated: clipped.truncated
      },
      rawLogs: {
        stdout: clipped.text
      }
    };
  }
};

export const writeFileTool: ToolImplementation<WriteFileToolInput> = {
  name: "write",
  description: "Create or overwrite a workspace file",
  inputSchema: writeFileToolSchema,
  approvalPolicy: "always",
  buildApproval(input) {
    const parsed = writeFileToolSchema.parse(input);
    return {
      title: `Write file · ${parsed.path}`,
      reason: `Write file: ${parsed.path}`,
      risk: "high"
    };
  },
  async invoke(input, context): Promise<ToolResult> {
    const target = resolveWorkspacePath(context.cwd, input.path);
    const existed = await pathExists(target);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, input.content, "utf8");

    return {
      ok: true,
      summary: `${input.path} · ${existed ? "updated" : "created"}`,
      structuredOutput: {
        path: input.path,
        existed,
        sizeBytes: Buffer.byteLength(input.content, "utf8"),
        lineCount: normalizeLines(input.content).length
      }
    };
  }
};

export const editFileTool: ToolImplementation<EditFileToolInput> = {
  name: "edit",
  description: "Replace a line range or entire workspace file",
  inputSchema: editFileToolSchema,
  approvalPolicy: "always",
  buildApproval(input) {
    const parsed = editFileToolSchema.parse(input);
    const range = formatRange(parsed.startLine, parsed.endLine);
    return {
      title: range ? `Edit file · ${parsed.path}${range}` : `Edit file · ${parsed.path}`,
      reason: range ? `Edit file: ${parsed.path}${range}` : `Edit file: ${parsed.path}`,
      risk: "high"
    };
  },
  async invoke(input, context): Promise<ToolResult> {
    const target = resolveWorkspacePath(context.cwd, input.path);
    const currentContent = await readFile(target, "utf8");
    const nextContent = applyLineEdit(currentContent, input);

    await writeFile(target, nextContent, "utf8");

    return {
      ok: true,
      summary: buildEditSummary(input, currentContent, nextContent),
      structuredOutput: {
        path: input.path,
        startLine: input.startLine,
        endLine: input.endLine,
        sizeBytes: Buffer.byteLength(nextContent, "utf8"),
        lineCount: normalizeLines(nextContent).length
      }
    };
  }
};

function applyLineEdit(content: string, input: EditFileToolInput) {
  const normalizedContent = content.replace(/\r\n/g, "\n");
  const hadTrailingNewline = normalizedContent.endsWith("\n");
  const sourceLines = normalizeLines(normalizedContent);
  const replacementLines = normalizeLines(input.replacement);

  if (sourceLines.length === 0 && input.startLine) {
    throw new Error(`Cannot edit line ${input.startLine} in an empty file`);
  }

  if (!input.startLine) {
    return preserveTrailingNewline(replacementLines.join("\n"), hadTrailingNewline);
  }

  const requestedEndLine = input.endLine ?? input.startLine;

  if (input.startLine > sourceLines.length) {
    throw new Error(`Start line ${input.startLine} is outside the file range 1-${sourceLines.length}`);
  }

  if (requestedEndLine > sourceLines.length) {
    throw new Error(`End line ${requestedEndLine} is outside the file range 1-${sourceLines.length}`);
  }

  const safeStartLine = input.startLine;
  const safeEndLine = Math.max(safeStartLine, requestedEndLine);
  const prefix = sourceLines.slice(0, safeStartLine - 1);
  const suffix = sourceLines.slice(safeEndLine);
  const nextLines = [...prefix, ...replacementLines, ...suffix];

  return preserveTrailingNewline(nextLines.join("\n"), hadTrailingNewline);
}

function buildEditSummary(input: EditFileToolInput, currentContent: string, nextContent: string) {
  const previousLines = normalizeLines(currentContent).length;
  const nextLines = normalizeLines(nextContent).length;
  const range = formatRange(input.startLine, input.endLine);

  if (!range) {
    return `${input.path} · replaced whole file (${previousLines} -> ${nextLines} lines)`;
  }

  return `${input.path}${range} · updated (${previousLines} -> ${nextLines} lines)`;
}

function buildReadSummary(input: {
  path: string;
  startLine: number;
  endLine: number;
  truncated: boolean;
}) {
  const range = `${input.startLine}-${input.endLine}`;
  const suffix = input.truncated ? " · truncated" : "";
  return `${input.path}:${range}${suffix}`;
}

function resolveWorkspacePath(cwd: string, inputPath: string) {
  const workspaceRoot = resolve(cwd);
  const target = resolve(workspaceRoot, inputPath);
  const relativePath = relative(workspaceRoot, target);

  if (relativePath === "" || (!relativePath.startsWith("..") && relativePath !== "..")) {
    return target;
  }

  throw new Error(`Path is outside the workspace: ${inputPath}`);
}

function normalizeLines(content: string) {
  const normalized = content.replace(/\r\n/g, "\n");

  if (normalized === "") {
    return [];
  }

  return normalized.endsWith("\n")
    ? normalized.slice(0, -1).split("\n")
    : normalized.split("\n");
}

function preserveTrailingNewline(content: string, hadTrailingNewline: boolean) {
  if (!hadTrailingNewline || content === "") {
    return content;
  }

  return content.endsWith("\n") ? content : `${content}\n`;
}

function clipText(text: string, maxBytes: number) {
  const size = Buffer.byteLength(text, "utf8");

  if (size <= maxBytes) {
    return {
      text,
      truncated: false
    };
  }

  let output = "";

  for (const char of text) {
    const next = `${output}${char}`;

    if (Buffer.byteLength(`${next}\n...truncated...`, "utf8") > maxBytes) {
      break;
    }

    output = next;
  }

  return {
    text: `${output}\n...truncated...`,
    truncated: true
  };
}

function formatRange(startLine?: number, endLine?: number) {
  if (!startLine) {
    return "";
  }

  const end = endLine ?? startLine;
  return `:${startLine}-${end}`;
}

async function pathExists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
