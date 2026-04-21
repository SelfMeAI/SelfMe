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
  const accent = input.role === "user" ? "cyan" : input.role === "error" ? "red" : input.role === "system" ? "yellow" : "white";
  const label = input.role === "user" ? "YOU" : input.role === "error" ? "ERR" : input.role === "system" ? "SYS" : "AI";

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={accent}>▌ </Text>
        <Text bold color={accent}>
          {label}
        </Text>
      </Box>
      <Box marginLeft={2}>
        <Text>{input.content || (input.streaming ? "…" : "")}</Text>
      </Box>
      {input.metadata ? (
        <Box marginLeft={2}>
          <Text dimColor>{input.metadata}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

function handleBufferInput(input: string, key: Key, update: (next: string | ((current: string) => string)) => void): "submit" | "cancel" | "noop" {
  const isCtrlEnter = key.ctrl && key.return;

  if (isCtrlEnter) {
    update((current) => `${current}\n`);
    return "noop";
  }

  if (key.return) {
    return "submit";
  }

  if (key.backspace || key.delete) {
    update((current) => current.slice(0, -1));
    return "noop";
  }

  if (!key.ctrl && !key.meta) {
    update((current) => `${current}${input}`);
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
  const [loadingIndex, setLoadingIndex] = useState(0);
  const [isExiting, setIsExiting] = useState(false);

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

    const result = handleBufferInput(input, key, setBuffer);

    if (result !== "submit") {
      return;
    }

    const content = buffer.trim();
    setBuffer("");

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

  return (
    <Box flexDirection="column" paddingX={1} paddingY={0}>
      {!connected ? (
        <Box marginBottom={1} paddingX={1}>
          <Text backgroundColor="yellow" color="black">
            {" "}Gateway disconnected. Reconnecting...{" "}
          </Text>
        </Box>
      ) : null}

      {!hasSentMessage ? (
        <Box borderStyle="round" borderColor="cyan" flexDirection="column" paddingX={1} paddingY={0} marginBottom={1}>
          <Logo />
          <Box marginTop={1}>
            <Text dimColor>v{config.version}</Text>
          </Box>
          <Box>
            <Text dimColor>Model </Text>
            <Text color="cyan">{config.model}</Text>
          </Box>
          <Box marginTop={1}>
            <Text bold color="cyan">
              ✨ Welcome back!
            </Text>
          </Box>
        </Box>
      ) : null}

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
        <Box marginBottom={1} borderStyle="round" borderColor="gray" paddingX={1}>
          <Text dimColor>📋 Queued ({queue.length})</Text>
          <Text> </Text>
          <Text dimColor>{queue[0]}</Text>
        </Box>
      ) : null}

      <Box borderStyle="round" borderColor={isGenerating ? "cyan" : "gray"} paddingX={1} flexDirection="column">
        <Text dimColor>{isGenerating ? "Press Esc to stop • Ctrl+Enter for new line" : "Type message • Enter to send • Ctrl+Enter new line"}</Text>
        {buffer ? (
          <Text>{buffer}</Text>
        ) : (
          <Text dimColor>Type message and press Enter</Text>
        )}
      </Box>

      <Box marginTop={1} justifyContent="space-between">
        <Text color={isGenerating ? "cyan" : "gray"}>{isGenerating ? `🐙 ${loadingFrames[loadingIndex]}` : " "}</Text>
        <Text dimColor>Ctrl+Enter New Line │ Esc Cancel │ Ctrl+C Quit</Text>
      </Box>
    </Box>
  );
}
