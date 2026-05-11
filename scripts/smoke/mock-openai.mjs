import http from "node:http";

const port = 9100;

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunkText(text, size = 6) {
  const chunks = [];

  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size));
  }

  return chunks;
}

function buildScenario(messages) {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user")?.content ?? "empty";

  if (lastUserMessage.includes("cancel smoke")) {
    return {
      chunkSize: 4,
      delayMs: 220,
      content: `这是 Mock OpenAI 的取消场景回复。我们会故意拉长回复长度，确保 Gateway 能在收到首个 chunk 之后及时中断生成流程。用户输入：${lastUserMessage}。这段文字会继续延长，用来稳定复现取消路径。`
    };
  }

  return {
    chunkSize: 6,
    delayMs: 80,
    content: `这是 Mock OpenAI 的流式回复，用来验证 SelfMe 新架构迁移是否稳定。用户输入：${lastUserMessage}`
  };
}

function buildStreamChunk(content, finishReason = null) {
  return JSON.stringify({
    id: "chatcmpl-mock-selfme",
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: "mock-gpt-selfme",
    choices: [
      {
        index: 0,
        delta: content ? { content } : {},
        finish_reason: finishReason
      }
    ]
  });
}

const server = http.createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, {
      status: "ok",
      service: "mock-openai"
    });
    return;
  }

  if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
    sendJson(response, 404, {
      error: "not_found"
    });
    return;
  }

  const body = await new Promise((resolve, reject) => {
    const chunks = [];

    request.on("data", (chunk) => {
      chunks.push(Buffer.from(chunk));
    });

    request.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });

    request.on("error", reject);
  });

  const payload = JSON.parse(body);
  const scenario = buildScenario(payload.messages ?? []);
  const content = scenario.content;

  if (!payload.stream) {
    sendJson(response, 200, {
      id: "chatcmpl-mock-selfme",
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "mock-gpt-selfme",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content
          },
          finish_reason: "stop"
        }
      ]
    });
    return;
  }

  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive"
  });

  response.write(`data: ${JSON.stringify({
    id: "chatcmpl-mock-selfme",
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: "mock-gpt-selfme",
    choices: [
      {
        index: 0,
        delta: {
          role: "assistant"
        },
        finish_reason: null
      }
    ]
  })}\n\n`);

  for (const chunk of chunkText(content, scenario.chunkSize)) {
    if (response.destroyed || response.writableEnded || request.socket.destroyed) {
      return;
    }

    await delay(scenario.delayMs);
    response.write(`data: ${buildStreamChunk(chunk)}\n\n`);
  }

  await delay(30);
  response.write(`data: ${buildStreamChunk("", "stop")}\n\n`);
  response.write("data: [DONE]\n\n");
  response.end();
});

function shutdown() {
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.listen(port, "127.0.0.1", () => {
  console.log(`[mock-openai] listening on http://127.0.0.1:${port}`);
});
