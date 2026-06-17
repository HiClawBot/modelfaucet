#!/usr/bin/env node
import http from "node:http";
import { pathToFileURL } from "node:url";

function estimateTokens(value) {
  return Math.max(1, Math.ceil(String(value).length / 4));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      if (body.trim().length === 0) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json"
  });
  response.end(JSON.stringify(payload));
}

function messagesToText(messages) {
  if (!Array.isArray(messages)) {
    return "";
  }

  return messages
    .map((message) =>
      typeof message?.content === "string" ? message.content : JSON.stringify(message)
    )
    .join("\n");
}

export function createMockOpenAiCompatibleServer() {
  return http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, {
        ok: true,
        service: "modelfaucet-mock-openai-compatible"
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/models") {
      sendJson(response, 200, {
        object: "list",
        data: [
          {
            id: "auto-text",
            object: "model",
            owned_by: "modelfaucet"
          }
        ]
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/chat/completions") {
      try {
        const body = await readJson(request);
        const model = typeof body.model === "string" ? body.model : "auto-text";
        const prompt = messagesToText(body.messages);
        const content = `ModelFaucet smoke response: ${prompt.slice(0, 120)}`;
        const promptTokens = estimateTokens(prompt);
        const completionTokens = estimateTokens(content);

        sendJson(response, 200, {
          id: `chatcmpl_mock_${Date.now().toString(36)}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content
              },
              finish_reason: "stop"
            }
          ],
          usage: {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: promptTokens + completionTokens
          }
        });
      } catch {
        sendJson(response, 400, {
          error: {
            message: "Invalid JSON body.",
            type: "invalid_request_error"
          }
        });
      }
      return;
    }

    sendJson(response, 404, {
      error: {
        message: "Not found.",
        type: "not_found"
      }
    });
  });
}

export async function startMockOpenAiCompatibleServer({
  host = "127.0.0.1",
  port = 4010
} = {}) {
  const server = createMockOpenAiCompatibleServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  return server;
}

const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  const host = process.env.HOST ?? "0.0.0.0";
  const port = Number(process.env.PORT ?? "4010");
  const server = await startMockOpenAiCompatibleServer({ host, port });
  console.log(`Mock OpenAI-compatible provider listening on http://${host}:${port}`);

  const shutdown = () => {
    server.close(() => {
      process.exit(0);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

