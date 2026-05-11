import { Box, Text, useApp, useInput } from "ink";
import { useEffect, useMemo, useState } from "react";

import type { Key } from "ink";

import { useGatewayChat } from "./hooks/use-gateway-chat.js";

const loadingFrames = ["▱▱▱▱▱", "▰▱▱▱▱", "▰▰▱▱▱", "▰▰▰▱▱", "▰▰▰▰▱", "▰▰▰▰▰", "▱▰▰▰▰", "▱▱▰▰▰", "▱▱▱▰▰", "▱▱▱▱▰"];

function Logo() {
  return (
    <Text color="cyan">
      {"  ███████╗███████╗██╗     ███████╗███╗   ███╗███████╗\n"}
      {"  ██╔════╝██╔════╝██║     ██╔════╝████╗ ████║██╔════╝\n"}
      {"  ███████╗█████╗  ██║     █████╗  ██╔████╔██║█████╗\n"}
      {"  ╚════██║██╔══╝  ██║     ██╔══╝  ██║╚██╔╝██║██╔══╝\n"}
      {"  ███████║███████╗███████╗██║     ██║ ╚═╝ ██║███████╗\n"}
      {"  ╚══════╝╚══════╝╚══════╝╚═╝     ╚═╝     ╚═╝╚══════╝"}
    </Text>
  );
}

function MessageBlock(input: {
  role: "user" | "assistant" | "error" | "system";
  content: string;
  metadata?: string;
  streaming?: boolean;
}) {
  if (input.role === "user") {
    return (
      <Box flexDirection="column" marginBottom={1} width="100%">
        <Box borderStyle="round" borderColor="cyan" paddingX={1} width="100%">
          <Text color="cyan">{input.content}</Text>
        </Box>
      </Box>
    );
  }

  const accent = input.role === "error" ? "red" : input.role === "system" ? "yellow" : "white";

  return (
    <Box flexDirection="column" marginBottom={1} width="100%">
      <Box borderStyle="round" borderColor={input.role === "assistant" ? "gray" : accent} paddingX={1} width="100%">
        <Text color={accent}>{input.content || (input.streaming ? "…" : "")}</Text>
      </Box>
      {input.metadata ? (
        <Box marginLeft={1}>
          <Text dimColor>{input.metadata}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

function formatDirectory(input: string): string {
  const home = process.env.HOME;

  if (home && input.startsWith(home)) {
    return `~${input.slice(home.length) || "/"}`;
  }

  return input;
}

function insertAt(input: string, value: string, index: number): string {
  return `${input.slice(0, index)}${value}${input.slice(index)}`;
}

function deleteBackward(input: string, index: number): { next: string; cursor: number } {
  if (index <= 0) {
    return { next: input, cursor: 0 };
  }

  return {
    next: `${input.slice(0, index - 1)}${input.slice(index)}`,
    cursor: index - 1
  };
}

function deleteForward(input: string, index: number): { next: string; cursor: number } {
  if (index >= input.length) {
    return { next: input, cursor: index };
  }

  return {
    next: `${input.slice(0, index)}${input.slice(index + 1)}`,
    cursor: index
  };
}

function getLineStartIndexes(input: string): number[] {
  const indexes = [0];

  for (let index = 0; index < input.length; index += 1) {
    if (input[index] === "\n") {
      indexes.push(index + 1);
    }
  }

  return indexes;
}

function getCursorLineColumn(input: string, cursor: number): { line: number; column: number } {
  const lines = input.slice(0, cursor).split("\n");
  const line = lines.length - 1;
  const column = lines.at(-1)?.length ?? 0;

  return { line, column };
}

function moveCursorVertical(input: string, cursor: number, direction: -1 | 1): number {
  const lineStarts = getLineStartIndexes(input);
  const lines = input.split("\n");
  const current = getCursorLineColumn(input, cursor);
  const nextLine = current.line + direction;

  if (nextLine < 0 || nextLine >= lines.length) {
    return cursor;
  }

  const nextColumn = Math.min(current.column, lines[nextLine]?.length ?? 0);
  return lineStarts[nextLine] + nextColumn;
}

function renderBufferWithCursor(buffer: string, cursor: number) {
  const lines = buffer.length > 0 ? buffer.split("\n") : [""];
  let consumed = 0;

  return lines.map((line, lineIndex) => {
    const isLastLine = lineIndex === lines.length - 1;
    const lineStart = consumed;
    const lineEnd = lineStart + line.length;
    const cursorOnLine = cursor >= lineStart && cursor <= lineEnd;
    const cursorColumn = cursorOnLine ? cursor - lineStart : -1;

    consumed += line.length + (isLastLine ? 0 : 1);

    if (!cursorOnLine) {
      return (
        <Text key={`line-${lineIndex}`}>
          {line}
        </Text>
      );
    }

    const before = line.slice(0, cursorColumn);
    const currentChar = line[cursorColumn] ?? " ";
    const after = line.slice(cursorColumn + (cursorColumn < line.length ? 1 : 0));

    return (
      <Box key={`line-${lineIndex}`}>
        <Text>{before}</Text>
        <Text backgroundColor="cyan" color="black">
          {currentChar}
        </Text>
        <Text>{after}</Text>
      </Box>
    );
  });
}

function handleBufferInput(
  input: string,
  key: Key,
  buffer: string,
  cursor: number,
  updateBuffer: (next: string) => void,
  updateCursor: (next: number) => void
): "submit" | "cancel" | "noop" {
  const isCtrlEnter = key.ctrl && key.return;

  if (isCtrlEnter) {
    updateBuffer(insertAt(buffer, "\n", cursor));
    updateCursor(cursor + 1);
    return "noop";
  }

  if (key.return) {
    return "submit";
  }

  if (key.backspace || key.delete) {
    const result = deleteBackward(buffer, cursor);
    updateBuffer(result.next);
    updateCursor(result.cursor);
    return "noop";
  }

  if (key.leftArrow) {
    updateCursor(Math.max(0, cursor - 1));
    return "noop";
  }

  if (key.rightArrow) {
    updateCursor(Math.min(buffer.length, cursor + 1));
    return "noop";
  }

  if (key.upArrow) {
    updateCursor(moveCursorVertical(buffer, cursor, -1));
    return "noop";
  }

  if (key.downArrow) {
    updateCursor(moveCursorVertical(buffer, cursor, 1));
    return "noop";
  }

  if (key.ctrl && input === "d") {
    const result = deleteForward(buffer, cursor);
    updateBuffer(result.next);
    updateCursor(result.cursor);
    return "noop";
  }

  if (!key.ctrl && !key.meta) {
    updateBuffer(insertAt(buffer, input, cursor));
    updateCursor(cursor + input.length);
  }

  return "noop";
}

export function App() {
  const { exit } = useApp();
  const {
    config,
    messages,
    queue,
    connected,
    isGenerating,
    hasSentMessage,
    sendMessage,
    cancelGeneration,
    disconnect,
    addLocalSystemMessage
  } = useGatewayChat();
  const [buffer, setBuffer] = useState("");
  const [cursor, setCursor] = useState(0);
  const [loadingIndex, setLoadingIndex] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  const directory = useMemo(() => formatDirectory(process.cwd()), []);

  useEffect(() => {
    if (!isGenerating) {
      return;
    }

    const timer = setInterval(() => {
      setLoadingIndex((current) => (current + 1) % loadingFrames.length);
    }, 100);

    return () => {
      clearInterval(timer);
    };
  }, [isGenerating]);

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      disconnect();
      exit();
      return;
    }

    if (key.escape && isGenerating) {
      cancelGeneration();
      return;
    }

    const result = handleBufferInput(input, key, buffer, cursor, setBuffer, setCursor);

    if (result !== "submit") {
      return;
    }

    const content = buffer.trim();
    setBuffer("");
    setCursor(0);

    if (!content) {
      return;
    }

    if (content.toLowerCase() === "exit") {
      addLocalSystemMessage("👋 Goodbye!");
      setIsExiting(true);
      return;
    }

    sendMessage(buffer);
  });

  useEffect(() => {
    if (!isExiting) {
      return;
    }

    const timer = setTimeout(() => {
      disconnect();
      exit();
    }, 1000);

    return () => {
      clearTimeout(timer);
    };
  }, [disconnect, exit, isExiting]);

  const visibleMessages = useMemo(() => messages.slice(-14), [messages]);
  const footerText = `${config.model} · ${directory}${connected ? "" : " · Gateway disconnected"}`;

  return (
    <Box flexDirection="column" paddingX={1} paddingY={0}>
      {!connected ? (
        <Box marginBottom={1} paddingX={1}>
          <Text backgroundColor="yellow" color="black">
            {" "}Gateway disconnected. Reconnecting...{" "}
          </Text>
        </Box>
      ) : null}

      <Box borderStyle="round" borderColor="cyan" flexDirection="column" paddingX={1} paddingY={0} marginBottom={1}>
        {!hasSentMessage ? <Logo /> : null}
        <Box marginTop={hasSentMessage ? 0 : 1}>
          <Text bold color="cyan">
            Terminal-first SelfMe workspace
          </Text>
        </Box>
        {!hasSentMessage ? (
          <>
            <Box>
              <Text dimColor>v{config.version}</Text>
            </Box>
            <Box>
              <Text dimColor>Model </Text>
              <Text color="cyan">{config.model}</Text>
            </Box>
            <Box>
              <Text dimColor>Directory </Text>
              <Text color="white">{directory}</Text>
            </Box>
          </>
        ) : (
          <Box>
            <Text dimColor>{`v${config.version} · ${config.model} · ${directory}`}</Text>
          </Box>
        )}
      </Box>

      <Box flexDirection="column" flexGrow={1}>
        {visibleMessages.map((message) => (
          <MessageBlock
            key={message.id}
            role={message.role}
            content={message.content}
            metadata={message.metadata}
            streaming={message.streaming}
          />
        ))}
      </Box>

      {queue.length > 0 ? (
        <Box marginBottom={1} borderStyle="round" borderColor="gray" paddingX={1} width="100%">
          <Text dimColor>Queue {queue.length}</Text>
          <Text> </Text>
          <Text dimColor>{queue[0]}</Text>
        </Box>
      ) : null}

      <Box borderStyle="round" borderColor={isGenerating ? "cyan" : "gray"} paddingX={1} paddingY={0} flexDirection="column" width="100%">
        {buffer ? renderBufferWithCursor(buffer, cursor) : (
          <Box>
            <Text backgroundColor="cyan" color="black">
              {" "}
            </Text>
            <Text dimColor> Write a message</Text>
          </Box>
        )}
      </Box>

      <Box marginTop={1} justifyContent="space-between">
        <Text color={isGenerating ? "cyan" : "gray"}>{isGenerating ? `🐙 ${loadingFrames[loadingIndex]}` : " "}</Text>
        <Text dimColor>{footerText}</Text>
      </Box>
    </Box>
  );
}
