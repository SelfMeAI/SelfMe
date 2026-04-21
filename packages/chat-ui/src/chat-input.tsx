"use client";

import { useEffect, useRef, useState } from "react";

interface ChatInputProps {
  disabled?: boolean;
  isStreaming?: boolean;
  isQueuing?: boolean;
  queueCount?: number;
  queuedMessage?: string;
  onSend: (text: string) => boolean;
  onStop: () => void;
}

export function ChatInput({
  disabled = false,
  isStreaming = false,
  isQueuing = false,
  queueCount = 0,
  queuedMessage = "",
  onSend,
  onStop
}: ChatInputProps) {
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const focusMonitorRef = useRef<number | null>(null);
  const hasMessage = message.trim().length > 0;

  function stopFocusMonitoring() {
    if (focusMonitorRef.current !== null) {
      window.clearInterval(focusMonitorRef.current);
      focusMonitorRef.current = null;
    }
  }

  function autoResize() {
    if (!inputRef.current) {
      return;
    }

    inputRef.current.style.height = "auto";
    inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 200)}px`;
  }

  function startFocusMonitoring(duration = 2000) {
    stopFocusMonitoring();

    let elapsed = 0;
    focusMonitorRef.current = window.setInterval(() => {
      if (inputRef.current && document.activeElement !== inputRef.current) {
        inputRef.current.focus();
      }

      elapsed += 100;
      if (elapsed >= duration) {
        stopFocusMonitoring();
      }
    }, 100);
  }

  function handleSend() {
    if (!message.trim()) {
      return;
    }

    const textToSend = message;
    const accepted = onSend(textToSend);

    if (!accepted) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
      return;
    }

    setMessage("");

    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.focus();
    }

    startFocusMonitoring(2000);
  }

  function handleStop() {
    onStop();
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }

  useEffect(() => {
    return () => {
      stopFocusMonitoring();
    };
  }, []);

  useEffect(() => {
    autoResize();
  }, [message]);

  return (
    <div className="composer-shell">
      {queueCount > 0 ? (
        <div className="queue-notice">
          <span className="queue-notice-label">{queueCount > 1 ? `Queued ${queueCount}` : "Queued 1"}</span>
          <span className="queue-notice-text">{queuedMessage}</span>
        </div>
      ) : null}

      <div className="composer-card">
        <textarea
          ref={inputRef}
          value={message}
          className="input-box"
          placeholder={isStreaming ? "Keep typing to queue the next message, or press Esc to stop." : "Type your message."}
          rows={1}
          disabled={disabled}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && isStreaming) {
              event.preventDefault();
              handleStop();
              return;
            }

            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              handleSend();
            }
          }}
        />

        <div className="composer-toolbar">
          <div className="composer-hints">
            <span className="composer-hint-item">
              <span className="composer-keycap">Enter</span>
              <span>{isStreaming ? "Queue next" : "Send"}</span>
            </span>
            <span className="composer-hint-item">
              <span className="composer-keycap">Shift+Enter</span>
              <span>New line</span>
            </span>
            {isStreaming ? (
              <span className="composer-hint-item">
                <span className="composer-keycap">Esc</span>
                <span>Stop</span>
              </span>
            ) : null}
          </div>

          <div className="composer-actions">
            {isStreaming ? (
              <button
                type="button"
                className="stop-button"
                onClick={handleStop}
                onMouseDown={(event) => event.preventDefault()}
                title="Stop generation (Esc)"
              >
                Stop
              </button>
            ) : null}
            <button
              type="button"
              className="send-button"
              disabled={!hasMessage}
              onClick={handleSend}
              onMouseDown={(event) => event.preventDefault()}
            >
              {isStreaming || isQueuing ? "Queue" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
