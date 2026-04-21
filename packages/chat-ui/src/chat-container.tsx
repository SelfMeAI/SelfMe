"use client";

import { useEffect, useRef, useState } from "react";

import type { LLMSettings, UpdateLLMSettingsInput } from "@selfme/protocol";

import { ChatInput } from "./chat-input";
import { ChatMessage } from "./chat-message";
import { ModelSettingsPanel } from "./model-settings-panel";
import type { UIMessage, WorkspaceView } from "./types";

interface ChatContainerProps {
  messages: UIMessage[];
  isStreaming: boolean;
  messageQueue: string[];
  version: string;
  activeView: WorkspaceView;
  modelSettings: LLMSettings | null;
  isSavingModelSettings: boolean;
  onViewChange: (view: WorkspaceView) => void;
  onSaveModelSettings: (input: UpdateLLMSettingsInput) => Promise<void>;
  onSend: (text: string) => boolean;
  onStop: () => void;
}

const starterPrompts = [
  {
    label: "Plan",
    title: "Map the next step",
    prompt: "Summarize the current task, list the key constraints, and propose the next implementation step."
  },
  {
    label: "Review",
    title: "Turn output into a checklist",
    prompt: "Review the latest output and convert it into a concise implementation checklist with verification items."
  },
  {
    label: "Debug",
    title: "Break down a bug",
    prompt: "Analyze the current bug, list likely causes, and propose a practical debugging plan."
  },
  {
    label: "Write",
    title: "Draft the implementation",
    prompt: "Draft the implementation approach, highlight risks, and note what should be verified after the change."
  }
] as const;

export function ChatContainer({
  messages,
  isStreaming,
  messageQueue,
  version,
  activeView,
  modelSettings,
  isSavingModelSettings,
  onViewChange,
  onSaveModelSettings,
  onSend,
  onStop
}: ChatContainerProps) {
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const scrollTimeoutRef = useRef<number | null>(null);
  const isUserScrollingRef = useRef(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [scrollButtonBottom, setScrollButtonBottom] = useState(128);

  function scrollToBottom(smooth = true) {
    if (!messagesRef.current) {
      return;
    }

    const activeElement = document.activeElement as HTMLElement | null;

    isUserScrollingRef.current = false;
    setShowScrollButton(false);
    messagesRef.current.scrollTo({
      top: messagesRef.current.scrollHeight,
      behavior: smooth ? "smooth" : "auto"
    });

    if (activeElement && (activeElement.tagName === "TEXTAREA" || activeElement.tagName === "INPUT")) {
      requestAnimationFrame(() => {
        activeElement.focus();
      });
    }
  }

  function checkScrollPosition() {
    if (!messagesRef.current) {
      return;
    }

    const threshold = 200;
    const { scrollHeight, scrollTop, clientHeight } = messagesRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < threshold;

    if (isAtBottom) {
      setShowScrollButton(false);
      isUserScrollingRef.current = false;
    } else if (messages.length > 0) {
      setShowScrollButton(true);
    }
  }

  useEffect(() => {
    const node = messagesRef.current;

    if (!node) {
      return;
    }

    function handleScroll() {
      if (scrollTimeoutRef.current !== null) {
        window.clearTimeout(scrollTimeoutRef.current);
      }

      isUserScrollingRef.current = true;
      scrollTimeoutRef.current = window.setTimeout(() => {
        checkScrollPosition();
      }, 150);
    }

    node.addEventListener("scroll", handleScroll);

    return () => {
      node.removeEventListener("scroll", handleScroll);
      if (scrollTimeoutRef.current !== null) {
        window.clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [messages.length]);

  useEffect(() => {
    if (!messagesRef.current) {
      return;
    }

    const activeElement = document.activeElement as HTMLElement | null;
    const threshold = 200;
    const { scrollHeight, scrollTop, clientHeight } = messagesRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < threshold;

    if (isAtBottom || !isUserScrollingRef.current) {
      scrollToBottom(false);
    }

    if (activeElement && (activeElement.tagName === "TEXTAREA" || activeElement.tagName === "INPUT")) {
      requestAnimationFrame(() => {
        activeElement.focus();
      });
    }
  }, [messages]);

  useEffect(() => {
    if (isStreaming || !messagesRef.current) {
      return;
    }

    const threshold = 200;
    const { scrollHeight, scrollTop, clientHeight } = messagesRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < threshold;

    if (isAtBottom || !isUserScrollingRef.current) {
      scrollToBottom(false);
    }
  }, [isStreaming]);

  useEffect(() => {
    const node = composerRef.current;

    if (!node || typeof ResizeObserver === "undefined") {
      return;
    }

    function updateOffset() {
      if (!composerRef.current) {
        return;
      }

      setScrollButtonBottom(composerRef.current.offsetHeight + 20);
    }

    updateOffset();

    const observer = new ResizeObserver(() => {
      updateOffset();
    });

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [messageQueue.length, isStreaming]);

  return (
    <div className={`chat-container ${messages.length > 0 ? "has-messages" : ""}`.trim()}>
      <aside className="workspace-sidebar">
        <div className="workspace-nav">
          <button
            type="button"
            className={`workspace-nav-button ${activeView === "chat" ? "workspace-nav-button-active" : ""}`.trim()}
            onClick={() => onViewChange("chat")}
          >
            <span className="workspace-nav-button-title">Chat</span>
          </button>
          <button
            type="button"
            className={`workspace-nav-button ${activeView === "settings" ? "workspace-nav-button-active" : ""}`.trim()}
            onClick={() => onViewChange("settings")}
          >
            <span className="workspace-nav-button-title">Model settings</span>
          </button>
        </div>

        <div className="workspace-sidebar-footer">
          <span className="workspace-sidebar-footer-label">Version</span>
          <span className="workspace-sidebar-footer-value">{version ? `v${version}` : "Loading"}</span>
        </div>
      </aside>

      <section className="chat-panel">
        {activeView === "chat" ? (
          <>
            <div ref={messagesRef} className="messages">
              {messages.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-header">
                    <div className="empty-state-intro">
                      <p className="empty-state-kicker">Start here</p>
                      <h1 className="empty-state-title">Open a chat or launch from a starter.</h1>
                    </div>
                    <p className="empty-state-text">Choose a practical starter below, or type directly in the composer.</p>
                  </div>

                  <div className="prompt-grid">
                    {starterPrompts.map((prompt) => (
                      <button key={prompt.title} type="button" className="prompt-card" onClick={() => onSend(prompt.prompt)}>
                        <span className="prompt-card-label">{prompt.label}</span>
                        <span className="prompt-card-title">{prompt.title}</span>
                        <span className="prompt-card-text">{prompt.prompt}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}
            </div>

            {showScrollButton ? (
              <button
                type="button"
                className="scroll-to-bottom"
                style={{ bottom: `${scrollButtonBottom}px` }}
                onClick={() => scrollToBottom()}
              >
                <span>New messages</span>
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M7 10l5 5 5-5z" />
                </svg>
              </button>
            ) : null}

            <div ref={composerRef}>
              <ChatInput
                onSend={onSend}
                onStop={onStop}
                disabled={false}
                isStreaming={isStreaming}
                isQueuing={messageQueue.length > 0}
                queueCount={messageQueue.length}
                queuedMessage={messageQueue[0] ?? ""}
              />
            </div>
          </>
        ) : (
          <ModelSettingsPanel
            settings={modelSettings}
            saving={isSavingModelSettings}
            onSave={onSaveModelSettings}
          />
        )}
      </section>
    </div>
  );
}
