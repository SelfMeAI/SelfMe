"use client";

import { useMemo } from "react";
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/common";
import { marked } from "marked";
import type { Tokens } from "marked";

import type { UIMessage } from "./types";

marked.setOptions({
  breaks: true,
  gfm: true
});

const renderer = new marked.Renderer();
const originalCode = renderer.code.bind(renderer) as (token: Tokens.Code) => string;

(renderer as unknown as { code: (token: Tokens.Code) => string }).code = (token: Tokens.Code) => {
  const code = token.text;
  const lang = token.lang ?? "";

  if (lang && hljs.getLanguage(lang)) {
    try {
      const highlighted = hljs.highlight(code, { language: lang }).value;
      return `<pre><code class="hljs language-${lang}">${highlighted}</code></pre>`;
    } catch {
      return originalCode(token);
    }
  }

  try {
    const result = hljs.highlightAuto(code);
    return `<pre><code class="hljs">${result.value}</code></pre>`;
  } catch {
    return originalCode(token);
  }
};

interface ChatMessageProps {
  message: UIMessage;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const renderedContent = useMemo(() => {
    if (message.role === "user") {
      return DOMPurify.sanitize(message.content.replace(/\n/g, "<br>"));
    }

    try {
      const html = marked.parse(message.content, { renderer }) as string;

      return DOMPurify.sanitize(html, {
        ADD_TAGS: ["table", "thead", "tbody", "tr", "th", "td", "tfoot", "input"],
        ADD_ATTR: ["align", "colspan", "rowspan", "class", "type", "checked", "disabled"]
      });
    } catch {
      return DOMPurify.sanitize(message.content.replace(/\n/g, "<br>"));
    }
  }, [message.content, message.role]);

  const formattedMetadata = useMemo(() => {
    if (!message.metadata) {
      return "";
    }

    return message.metadata;
  }, [message.metadata]);

  const formattedTime = useMemo(() => {
    try {
      return new Date(message.createdAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return "";
    }
  }, [message.createdAt]);

  const roleLabel = message.role === "user" ? "You" : "SelfMe";

  return (
    <div className={`message-wrapper message-wrapper-${message.role}`}>
      <div className="message-header">
        <span className={`message-badge message-badge-${message.role}`.trim()}>{roleLabel}</span>
        {message.streaming ? <span className="message-live-pill">Streaming</span> : null}
        {formattedTime ? <span className="message-time">{formattedTime}</span> : null}
      </div>
      <div className={`message ${message.role} ${message.streaming ? "streaming" : ""}`.trim()}>
        {message.streaming && !message.content ? (
          <div className="typing-indicator">
            <span />
            <span />
            <span />
          </div>
        ) : (
          <div className="message-content" dangerouslySetInnerHTML={{ __html: renderedContent }} />
        )}
      </div>
      {message.metadata ? <div className="message-meta">{formattedMetadata}</div> : null}
    </div>
  );
}
